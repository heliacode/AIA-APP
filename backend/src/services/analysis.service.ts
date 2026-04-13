import prisma from '../database/client';
import { Prisma, type AnalysisStatus } from '@prisma/client';
import { openaiService } from './openai.service';
import { geminiService } from './gemini.service';
import { locationService } from './location.service';
import { pricingService } from './pricing.service';
import type { PricingInput } from './pricing.service';
import { AppError } from '../utils/app-error';
import { getErrorMessage } from '../utils/get-error-message';
import { mapWithConcurrency } from '../utils/concurrency';
import type { ContainerType } from '../types/container';
import type { VisionItem } from '../types';

const VISION_CONCURRENCY = Math.max(
  1,
  Math.min(10, Number(process.env.VISION_CONCURRENCY) || 3)
);

function isGeminiModel(modelId: string): boolean {
  return modelId.startsWith('gemini-');
}

function analyzeWithSelectedModel(
  imageBuffer: Buffer,
  imageType: string,
  model: string | null | undefined
) {
  return isGeminiModel(model || '')
    ? geminiService.analyzeImage(imageBuffer, imageType, model)
    : openaiService.analyzeImage(imageBuffer, imageType, model);
}

interface ImageRow {
  id: string;
  imageData: Buffer | Uint8Array;
  imageType: string;
  fileName: string;
}

/**
 * Container-type-specific Prisma operations. The generic workflow below drives them.
 */
interface ContainerAdapter {
  type: ContainerType;
  containerId: string;
  logPrefix: string;
  listImages(): Promise<ImageRow[]>;
  updateRun(runId: string, data: Prisma.InputJsonObject, status?: AnalysisStatus): Promise<void>;
  updateContainer(data: Prisma.InputJsonObject, status?: AnalysisStatus): Promise<void>;
  createItem(args: {
    runId: string;
    imageId: string;
    itemData: VisionItem;
    aiAnalysis: Prisma.InputJsonObject;
  }): Promise<{ id: string }>;
  updateItemPricing(
    itemId: string,
    data: { estimatedValue: number; replacementValue: number; aiAnalysis: Prisma.InputJsonObject }
  ): Promise<void>;
}

function roomAdapter(roomId: string): ContainerAdapter {
  return {
    type: 'room',
    containerId: roomId,
    logPrefix: `[Room ${roomId}]`,
    listImages: () =>
      prisma.roomImage.findMany({ where: { roomId }, orderBy: { uploadOrder: 'asc' } }),
    updateRun: async (runId, analysisMetadata, status) => {
      await prisma.roomAnalysisRun.update({
        where: { id: runId },
        data: { ...(status && { status }), analysisMetadata },
      });
    },
    updateContainer: async (analysisMetadata, status) => {
      await prisma.room.update({
        where: { id: roomId },
        data: { ...(status && { analysisStatus: status }), analysisMetadata },
      });
    },
    createItem: async ({ runId, imageId, itemData, aiAnalysis }) => {
      const created = await prisma.roomDetectedItem.create({
        data: {
          roomId,
          roomAnalysisRunId: runId,
          roomImageId: imageId,
          category: itemData.category,
          itemName: itemData.name,
          brand: itemData.brand ?? undefined,
          model: itemData.model ?? undefined,
          condition: itemData.condition,
          estimatedAge: itemData.estimatedAge ?? undefined,
          estimatedValue: 0,
          replacementValue: 0,
          aiAnalysis,
        },
      });
      return { id: created.id };
    },
    updateItemPricing: async (itemId, data) => {
      await prisma.roomDetectedItem.update({ where: { id: itemId }, data });
    },
  };
}

function safeAdapter(safeId: string): ContainerAdapter {
  return {
    type: 'safe',
    containerId: safeId,
    logPrefix: `[Safe ${safeId}]`,
    listImages: () =>
      prisma.safeImage.findMany({ where: { safeId }, orderBy: { uploadOrder: 'asc' } }),
    updateRun: async (runId, analysisMetadata, status) => {
      await prisma.safeAnalysisRun.update({
        where: { id: runId },
        data: { ...(status && { status }), analysisMetadata },
      });
    },
    updateContainer: async (analysisMetadata, status) => {
      await prisma.safe.update({
        where: { id: safeId },
        data: { ...(status && { analysisStatus: status }), analysisMetadata },
      });
    },
    createItem: async ({ runId, imageId, itemData, aiAnalysis }) => {
      const created = await prisma.safeDetectedItem.create({
        data: {
          safeId,
          safeAnalysisRunId: runId,
          safeImageId: imageId,
          category: itemData.category,
          itemName: itemData.name,
          brand: itemData.brand ?? undefined,
          model: itemData.model ?? undefined,
          condition: itemData.condition,
          estimatedAge: itemData.estimatedAge ?? undefined,
          estimatedValue: 0,
          replacementValue: 0,
          aiAnalysis,
        },
      });
      return { id: created.id };
    },
    updateItemPricing: async (itemId, data) => {
      await prisma.safeDetectedItem.update({ where: { id: itemId }, data });
    },
  };
}

async function processContainerAnalysis(
  adapter: ContainerAdapter,
  model: string | null | undefined,
  runId: string
): Promise<void> {
  const images = await adapter.listImages();
  const errors: string[] = [];
  let processed = 0;
  const createdItems: {
    id: string;
    input: PricingInput;
    aiAnalysis: Prisma.InputJsonObject;
  }[] = [];

  const visionResults = await mapWithConcurrency(
    images,
    VISION_CONCURRENCY,
    (image) => analyzeWithSelectedModel(Buffer.from(image.imageData), image.imageType, model),
    async () => {
      processed++;
      try {
        await adapter.updateRun(runId, {
          processedImages: processed,
          totalImages: images.length,
        });
      } catch {
        // progress updates are best-effort
      }
    }
  );

  const usageLog: Prisma.InputJsonValue[] = [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const result = visionResults[i];
    if (result.error) {
      errors.push(`${image.fileName}: ${getErrorMessage(result.error, 'Erreur')}`);
      continue;
    }
    const value = result.value;
    if (!value) continue;
    usageLog.push({ imageId: image.id, ...value.usage });
    for (const itemData of value.items) {
      const aiAnalysis: Prisma.InputJsonObject = {
        description: itemData.description,
        sourceImageId: image.id,
        ...(itemData.confidence !== undefined && { confidence: itemData.confidence }),
        boundingBox: itemData.boundingBox
          ? {
              x: itemData.boundingBox.x,
              y: itemData.boundingBox.y,
              width: itemData.boundingBox.width,
              height: itemData.boundingBox.height,
            }
          : undefined,
      };
      const created = await adapter.createItem({
        runId,
        imageId: image.id,
        itemData,
        aiAnalysis,
      });
      createdItems.push({
        id: created.id,
        input: {
          itemName: itemData.name,
          brand: itemData.brand ?? undefined,
          model: itemData.model ?? undefined,
          category: itemData.category,
        },
        aiAnalysis,
      });
    }
  }

  // Pricing pass (non-fatal)
  try {
    if (createdItems.length > 0) {
      const pricingResults = await pricingService.estimatePrices(
        createdItems.map((item) => item.input)
      );
      for (let i = 0; i < createdItems.length; i++) {
        const pricing = pricingResults[i];
        if (pricing && (pricing.estimatedValue > 0 || pricing.pricingMetadata)) {
          await adapter.updateItemPricing(createdItems[i].id, {
            estimatedValue: pricing.estimatedValue,
            replacementValue: pricing.replacementValue,
            aiAnalysis: {
              ...createdItems[i].aiAnalysis,
              ...(pricing.pricingMetadata
                ? { pricing: pricing.pricingMetadata as unknown as Prisma.InputJsonObject }
                : {}),
            } as Prisma.InputJsonObject,
          });
        }
      }
    }
  } catch (pricingErr) {
    console.warn(`${adapter.logPrefix} Pricing failed (non-fatal):`, (pricingErr as Error).message);
  }

  const runStatus = errors.length === images.length ? 'error' : 'completed';
  const finalMetadata: Prisma.InputJsonObject = {
    processedImages: processed,
    totalImages: images.length,
    ...(errors.length > 0 && { errors }),
    ...(usageLog.length > 0 && { usage: usageLog }),
  };
  await adapter.updateRun(runId, finalMetadata, runStatus);
  await adapter.updateContainer(finalMetadata, runStatus);
}

class AnalysisService {
  async startRoomAnalysis(roomId: string, userId: string, model?: string | null) {
    await locationService.getRoomById(roomId, userId);
    const images = await prisma.roomImage.findMany({
      where: { roomId },
      orderBy: { uploadOrder: 'asc' },
    });
    if (images.length === 0) throw AppError.badRequest('Aucune photo dans cette piece');

    const modelId = model && model.trim() ? model.trim() : 'gpt-5.2';
    const run = await prisma.roomAnalysisRun.create({
      data: { roomId, modelId, status: 'processing', analysisMetadata: {} },
    });
    await prisma.room.update({
      where: { id: roomId },
      data: { analysisStatus: 'processing', analysisMetadata: {} },
    });

    const adapter = roomAdapter(roomId);
    processContainerAnalysis(adapter, model, run.id).catch(async (err) => {
      console.error(`${adapter.logPrefix} Analysis error:`, err);
      const errorMetadata = { error: (err as Error).message };
      await adapter.updateRun(run.id, errorMetadata, 'error').catch(() => {});
      await adapter.updateContainer(errorMetadata, 'error').catch(() => {});
    });
  }

  async startSafeAnalysis(safeId: string, userId: string, model?: string | null) {
    await locationService.getSafeById(safeId, userId);
    const images = await prisma.safeImage.findMany({
      where: { safeId },
      orderBy: { uploadOrder: 'asc' },
    });
    if (images.length === 0) throw AppError.badRequest('Aucune photo dans ce coffre');

    const modelId = model && model.trim() ? model.trim() : 'gpt-5.2';
    const run = await prisma.safeAnalysisRun.create({
      data: { safeId, modelId, status: 'processing', analysisMetadata: {} },
    });
    await prisma.safe.update({
      where: { id: safeId },
      data: { analysisStatus: 'processing', analysisMetadata: {} },
    });

    const adapter = safeAdapter(safeId);
    processContainerAnalysis(adapter, model, run.id).catch(async (err) => {
      console.error(`${adapter.logPrefix} Analysis error:`, err);
      const errorMetadata = { error: (err as Error).message };
      await adapter.updateRun(run.id, errorMetadata, 'error').catch(() => {});
      await adapter.updateContainer(errorMetadata, 'error').catch(() => {});
    });
  }

  startContainerAnalysis(
    type: ContainerType,
    containerId: string,
    userId: string,
    model?: string | null
  ) {
    return type === 'room'
      ? this.startRoomAnalysis(containerId, userId, model)
      : this.startSafeAnalysis(containerId, userId, model);
  }
}

export const analysisService = new AnalysisService();
