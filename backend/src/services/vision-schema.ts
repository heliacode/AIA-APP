import type { ItemCategory, ItemCondition } from '../types';

export const VISION_CATEGORIES: readonly ItemCategory[] = [
  'furniture',
  'electronics',
  'clothing',
  'appliances',
  'decor',
  'jewelry',
  'art',
  'collectibles',
  'sports_equipment',
  'other',
] as const;

export const VISION_CONDITIONS: readonly ItemCondition[] = [
  'new',
  'excellent',
  'good',
  'fair',
  'poor',
] as const;

export const VISION_PROMPT = `Vous analysez une photo pour un inventaire d'assurance habitation. Listez UNIQUEMENT les OBJETS et BIENS assurables (meubles, électronique, électroménager, bijoux, œuvres d'art, objets de valeur).

EXCLUSIONS ABSOLUES:
- JAMAIS de personnes (adultes, enfants, bébés, silhouettes humaines) ni d'animaux.
- PAS d'objets sans valeur significative (gobelets jetables, papiers, déchets, nourriture, produits courants sans valeur).

Toutes les chaînes textuelles (name, description) doivent être en FRANÇAIS.

Pour chaque objet fournissez: un nom clair et spécifique (ex: "Téléviseur LED Samsung 55 pouces"), la marque et le modèle si visibles (null sinon), une description utile pour une réclamation (matériau, couleur, dimensions estimées), l'âge estimé en années (0 si neuf), et un score "confidence" entre 0 et 1 reflétant votre certitude sur l'identification.`;

/**
 * OpenAI Responses API strict json_schema.
 * Strict mode requires: every property in `required`, `additionalProperties: false`,
 * and nullable fields expressed as `type: ["<t>", "null"]`.
 */
export const openAIVisionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'category',
          'brand',
          'model',
          'condition',
          'estimatedAge',
          'description',
          'confidence',
          'boundingBox',
        ],
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: [...VISION_CATEGORIES] },
          brand: { type: ['string', 'null'] },
          model: { type: ['string', 'null'] },
          condition: { type: 'string', enum: [...VISION_CONDITIONS] },
          estimatedAge: { type: 'number' },
          description: { type: 'string' },
          confidence: { type: 'number' },
          boundingBox: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['x', 'y', 'width', 'height'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Gemini responseSchema (OpenAPI subset).
 * Uses box_2d [ymin, xmin, ymax, xmax] in 0-1000 per Gemini grounding convention.
 */
export const geminiVisionSchema = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          category: { type: 'STRING', enum: [...VISION_CATEGORIES] },
          brand: { type: 'STRING', nullable: true },
          model: { type: 'STRING', nullable: true },
          condition: { type: 'STRING', enum: [...VISION_CONDITIONS] },
          estimatedAge: { type: 'NUMBER' },
          description: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          box_2d: {
            type: 'ARRAY',
            nullable: true,
            items: { type: 'INTEGER' },
            description: '[ymin, xmin, ymax, xmax] en 0-1000',
          },
        },
        required: [
          'name',
          'category',
          'condition',
          'estimatedAge',
          'description',
          'confidence',
        ],
        propertyOrdering: [
          'name',
          'category',
          'brand',
          'model',
          'condition',
          'estimatedAge',
          'description',
          'confidence',
          'box_2d',
        ],
      },
    },
  },
  required: ['items'],
} as const;

export function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Safety net: strip items whose name/description clearly denotes a person.
 * Schema enforces shape, not semantics — the model occasionally ignores the
 * no-persons rule, and this insurance product must never list humans.
 */
const PERSON_KEYWORDS = /\b(personne|person|people|humain|human|child|children|kid|kids|baby|b[ée]b[ée]|adult|adulte|homme|monsieur|dame|femme|enfant|man|woman|visage|face|silhouette)\b/i;

export function isPersonItem(name: string, description: string): boolean {
  return PERSON_KEYWORDS.test(name) || PERSON_KEYWORDS.test(description);
}
