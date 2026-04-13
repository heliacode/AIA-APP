import OpenAI from 'openai';
import { VisionItem, ItemCategory, ItemCondition, VisionAnalysisResult } from '../types';
import {
  VISION_PROMPT,
  VISION_CATEGORIES,
  VISION_CONDITIONS,
  openAIVisionSchema,
  clampUnit,
  isPersonItem,
} from './vision-schema';
import { preprocessForVision } from '../utils/image-preprocess';
import { retryAsync } from '../utils/retry';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** Vision models users can select (id = API model name) */
export const VISION_MODELS = [
  { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro (meilleure qualité, plus lent)' },
  { id: 'gpt-5.2', label: 'GPT-5.2 (recommandé)' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini (rapide, économique)' },
  { id: 'gpt-4o', label: 'GPT-4o (alternatif)' },
] as const;

export type VisionModelId = (typeof VISION_MODELS)[number]['id'];

const ALLOWED_IDS = new Set<string>(VISION_MODELS.map((m) => m.id));

// Default: gpt-5.2. Validate env override at boot — typo would silently break analysis.
const ENV_MODEL = process.env.OPENAI_VISION_MODEL;
if (ENV_MODEL && !ALLOWED_IDS.has(ENV_MODEL)) {
  console.warn(
    `OPENAI_VISION_MODEL="${ENV_MODEL}" is not in VISION_MODELS; falling back to gpt-5.2`
  );
}
const DEFAULT_VISION_MODEL: VisionModelId =
  ENV_MODEL && ALLOWED_IDS.has(ENV_MODEL) ? (ENV_MODEL as VisionModelId) : 'gpt-5.2';

// GPT-5 reasoning models do not support the temperature parameter.
const MODELS_WITHOUT_TEMPERATURE = new Set<string>([
  'gpt-5.2-pro',
  'gpt-5.2',
  'gpt-5-mini',
]);

function resolveModel(userModel?: string | null): VisionModelId {
  if (userModel && ALLOWED_IDS.has(userModel)) return userModel as VisionModelId;
  return DEFAULT_VISION_MODEL;
}

type RawItem = {
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  condition: string;
  estimatedAge: number;
  description: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
};

const CATEGORY_SET = new Set<string>(VISION_CATEGORIES);
const CONDITION_SET = new Set<string>(VISION_CONDITIONS);

class OpenAIService {
  async analyzeImage(
    imageBuffer: Buffer,
    imageType: string = 'image/jpeg',
    model?: string | null
  ): Promise<VisionAnalysisResult> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer: empty or corrupted');
    }

    const processed = await preprocessForVision(imageBuffer, imageType);
    const base64Image = processed.buffer.toString('base64');
    const imageDataUrl = `data:${processed.mimeType};base64,${base64Image}`;
    const modelId = resolveModel(model);
    const supportsTemperature = !MODELS_WITHOUT_TEMPERATURE.has(modelId);

    const startedAt = Date.now();
    try {
      const response = await retryAsync(
        () =>
          openai.responses.create({
            model: modelId,
            ...(supportsTemperature ? { temperature: 0 } : {}),
            input: [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: VISION_PROMPT },
                  { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
                ],
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'insurance_vision_items',
                strict: true,
                schema: openAIVisionSchema,
              },
            },
          }),
        {
          onRetry: (err, attempt) =>
            console.warn(`[OpenAI] retry ${attempt}: ${(err as Error).message}`),
        }
      );

      const usage = {
        modelId,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        totalTokens: response.usage?.total_tokens,
        latencyMs: Date.now() - startedAt,
      };

      const content = response.output_text;
      if (!content) {
        console.warn('OpenAI returned empty content');
        return { items: [], usage };
      }

      // Strict schema guarantees valid JSON; no regex fallback needed.
      const parsed = JSON.parse(content) as { items?: RawItem[] };
      const rawItems = parsed.items ?? [];
      const safeItems = rawItems.filter((it) => {
        if (isPersonItem(it.name ?? '', it.description ?? '')) {
          console.warn(`OpenAI: excluding person-like item: "${it.name}"`);
          return false;
        }
        return true;
      });
      console.log(
        `OpenAI identified ${safeItems.length} items (model=${modelId}, ${rawItems.length - safeItems.length} filtered, img ${processed.originalBytes}→${processed.processedBytes}B)`
      );

      const items: VisionItem[] = safeItems.map((item) => {
        const category: ItemCategory = CATEGORY_SET.has(item.category)
          ? (item.category as ItemCategory)
          : 'other';
        const condition: ItemCondition = CONDITION_SET.has(item.condition)
          ? (item.condition as ItemCondition)
          : 'good';
        return {
          name: item.name || 'Unknown Item',
          category,
          brand: item.brand ?? undefined,
          model: item.model ?? undefined,
          condition,
          estimatedAge: item.estimatedAge,
          description: item.description || `${item.name} identified in image`,
          confidence: clampUnit(item.confidence),
          boundingBox: item.boundingBox
            ? {
                x: clampUnit(item.boundingBox.x),
                y: clampUnit(item.boundingBox.y),
                width: clampUnit(item.boundingBox.width),
                height: clampUnit(item.boundingBox.height),
              }
            : undefined,
        };
      });
      return { items, usage };
    } catch (error: unknown) {
      console.error('OpenAI API error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`OpenAI API error: ${msg}`);
    }
  }
}

export const openaiService = new OpenAIService();
