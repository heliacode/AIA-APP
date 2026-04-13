import { VisionItem, BoundingBox, ItemCategory, ItemCondition, VisionAnalysisResult } from '../types';
import {
  VISION_PROMPT,
  VISION_CATEGORIES,
  VISION_CONDITIONS,
  geminiVisionSchema,
  clampUnit,
  isPersonItem,
} from './vision-schema';
import { preprocessForVision } from '../utils/image-preprocess';
import { retryAsync } from '../utils/retry';

/** Gemini models users can select (id = API model name) */
export const GEMINI_MODELS = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (meilleure qualite, bounding boxes)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (rapide, economique)' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (le plus economique)' },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]['id'];

const ALLOWED_IDS = new Set<string>(GEMINI_MODELS.map((m) => m.id));
const DEFAULT_GEMINI_MODEL: GeminiModelId = 'gemini-2.5-flash';

function resolveModel(userModel?: string | null): GeminiModelId {
  if (userModel && ALLOWED_IDS.has(userModel)) return userModel as GeminiModelId;
  return DEFAULT_GEMINI_MODEL;
}

function convertBox2d(box: number[]): BoundingBox | undefined {
  if (!Array.isArray(box) || box.length !== 4) return undefined;
  const [ymin, xmin, ymax, xmax] = box;
  return {
    x: clampUnit(xmin / 1000),
    y: clampUnit(ymin / 1000),
    width: clampUnit((xmax - xmin) / 1000),
    height: clampUnit((ymax - ymin) / 1000),
  };
}

const CATEGORY_SET = new Set<string>(VISION_CATEGORIES);
const CONDITION_SET = new Set<string>(VISION_CONDITIONS);

type RawItem = {
  name: string;
  category: string;
  brand?: string | null;
  model?: string | null;
  condition: string;
  estimatedAge: number;
  description: string;
  confidence: number;
  box_2d?: number[] | null;
};

interface GeminiApiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message: string; code: number };
}

class GeminiService {
  async analyzeImage(
    imageBuffer: Buffer,
    imageType: string = 'image/jpeg',
    model?: string | null
  ): Promise<VisionAnalysisResult> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const modelId = resolveModel(model);

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer: empty or corrupted');
    }
    const processed = await preprocessForVision(imageBuffer, imageType);
    const base64Image = processed.buffer.toString('base64');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const startedAt = Date.now();
    try {
      const json = await retryAsync<GeminiApiResponse>(
        async () => {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: VISION_PROMPT },
                    { inlineData: { mimeType: processed.mimeType, data: base64Image } },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: geminiVisionSchema,
              },
            }),
          });
          if (!res.ok) {
            const errorBody = await res.text();
            const err = new Error(`Gemini API HTTP ${res.status}: ${errorBody}`) as Error & {
              status: number;
            };
            err.status = res.status;
            throw err;
          }
          return (await res.json()) as GeminiApiResponse;
        },
        {
          onRetry: (err, attempt) =>
            console.warn(`[Gemini] retry ${attempt}: ${(err as Error).message}`),
        }
      );
      if (json.error) throw new Error(`Gemini API error: ${json.error.message}`);

      const usage = {
        modelId,
        inputTokens: json.usageMetadata?.promptTokenCount,
        outputTokens: json.usageMetadata?.candidatesTokenCount,
        totalTokens: json.usageMetadata?.totalTokenCount,
        latencyMs: Date.now() - startedAt,
      };

      const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        console.warn('Gemini returned empty content');
        return { items: [], usage };
      }

      const parsed = JSON.parse(content) as { items?: RawItem[] };
      const rawItems = parsed.items ?? [];
      const safeItems = rawItems.filter((it) => {
        if (isPersonItem(it.name ?? '', it.description ?? '')) {
          console.warn(`Gemini: excluding person-like item: "${it.name}"`);
          return false;
        }
        return true;
      });
      console.log(
        `Gemini identified ${safeItems.length} items (model=${modelId}, ${rawItems.length - safeItems.length} filtered, img ${processed.originalBytes}→${processed.processedBytes}B)`
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
          boundingBox: item.box_2d ? convertBox2d(item.box_2d) : undefined,
        };
      });
      return { items, usage };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Gemini API error:', err);
      throw new Error(`Gemini API error: ${err.message}`);
    }
  }
}

export const geminiService = new GeminiService();
