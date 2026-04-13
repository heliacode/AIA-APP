export type InventoryStatus = 'draft' | 'processing' | 'completed' | 'error';
export type ItemCategory = 'furniture' | 'electronics' | 'clothing' | 'appliances' | 'decor' | 'jewelry' | 'art' | 'collectibles' | 'sports_equipment' | 'other';
export type ItemCondition = 'new' | 'excellent' | 'good' | 'fair' | 'poor';
export type ReportType = 'pdf' | 'json' | 'csv';

export interface CreateInventoryDto {
  images: Express.Multer.File[];
}

export interface UpdateInventoryDto {
  status?: InventoryStatus;
  metadata?: Record<string, unknown>;
}

export interface InventoryResponse {
  id: string;
  name?: string;
  status: InventoryStatus;
  totalEstimatedValue: number;
  recommendedInsuranceAmount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  items?: InventoryItemResponse[];
  images?: InventoryImageResponse[];
}

export interface InventoryItemResponse {
  id: string;
  category: ItemCategory;
  itemName: string;
  brand?: string;
  model?: string;
  condition: ItemCondition;
  estimatedAge?: number;
  notes?: string;
  estimatedValue: number;
  replacementValue: number;
  aiAnalysis: Record<string, unknown>;
  priceData: Record<string, unknown>;
}

export interface InventoryImageResponse {
  id: string;
  fileName: string;
  fileSize: number;
  uploadOrder: number;
  createdAt: Date;
}

export interface BoundingBox {
  x: number; // Normalized x coordinate (0-1)
  y: number; // Normalized y coordinate (0-1)
  width: number; // Normalized width (0-1)
  height: number; // Normalized height (0-1)
}

export interface VisionUsage {
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs: number;
}

export interface VisionAnalysisResult {
  items: VisionItem[];
  usage: VisionUsage;
}

export interface VisionItem {
  name: string;
  category: ItemCategory;
  brand?: string;
  model?: string;
  condition: ItemCondition;
  estimatedAge?: number;
  description: string;
  confidence?: number; // 0-1, model self-reported certainty
  boundingBox?: BoundingBox; // Normalized coordinates (0-1 range)
}

/** @deprecated Use VisionItem instead */
export type OpenAIItem = VisionItem;
