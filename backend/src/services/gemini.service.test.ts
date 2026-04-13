import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GEMINI_MODELS, geminiService } from './gemini.service';

function mockFetchResponse(body: object, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function geminiApiBody(text: string) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
  };
}

describe('GEMINI_MODELS', () => {
  it('exports 3 models', () => {
    expect(GEMINI_MODELS).toHaveLength(3);
  });

  it('all IDs start with gemini-', () => {
    for (const m of GEMINI_MODELS) {
      expect(m.id).toMatch(/^gemini-/);
    }
  });

  it('all have a label', () => {
    for (const m of GEMINI_MODELS) {
      expect(m.label.length).toBeGreaterThan(0);
    }
  });
});

describe('geminiService.analyzeImage', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.restoreAllMocks();
  });

  it('throws if GEMINI_API_KEY is not set', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const buf = Buffer.from('fake-image');
    await expect(geminiService.analyzeImage(buf, 'image/jpeg')).rejects.toThrow(
      'Gemini API key not configured'
    );
  });

  it('parses Gemini response and converts box_2d to boundingBox', async () => {
    const payload = JSON.stringify({
      items: [
        {
          name: 'Canape en cuir',
          category: 'furniture',
          brand: null,
          model: null,
          condition: 'good',
          estimatedAge: 3,
          description: 'Grand canape en cuir marron',
          box_2d: [100, 200, 500, 800],
        },
      ],
    });
    vi.stubGlobal('fetch', mockFetchResponse(geminiApiBody(payload)));

    const buf = Buffer.from('fake-image');
    const { items } = await geminiService.analyzeImage(buf, 'image/jpeg', 'gemini-2.5-flash');

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Canape en cuir');
    expect(items[0].category).toBe('furniture');
    expect(items[0].boundingBox).toEqual({
      x: 0.2,   // xmin 200/1000
      y: 0.1,   // ymin 100/1000
      width: 0.6,  // (800-200)/1000
      height: 0.4, // (500-100)/1000
    });
  });

  it('filters out person-like items', async () => {
    const payload = JSON.stringify({
      items: [
        {
          name: 'Personne assise',
          category: 'other',
          condition: 'good',
          description: 'Un homme sur le canape',
        },
        {
          name: 'Table basse',
          category: 'furniture',
          condition: 'good',
          description: 'Table en bois',
          box_2d: [0, 0, 500, 500],
        },
      ],
    });
    vi.stubGlobal('fetch', mockFetchResponse(geminiApiBody(payload)));

    const buf = Buffer.from('fake-image');
    const { items } = await geminiService.analyzeImage(buf, 'image/jpeg');

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Table basse');
  });

  it('handles missing box_2d gracefully', async () => {
    const payload = JSON.stringify({
      items: [
        {
          name: 'Lampe de bureau',
          category: 'decor',
          condition: 'excellent',
          description: 'Lampe LED moderne',
        },
      ],
    });
    vi.stubGlobal('fetch', mockFetchResponse(geminiApiBody(payload)));

    const buf = Buffer.from('fake-image');
    const { items } = await geminiService.analyzeImage(buf, 'image/jpeg');

    expect(items).toHaveLength(1);
    expect(items[0].boundingBox).toBeUndefined();
  });

  it('handles empty response', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(geminiApiBody('')));

    const buf = Buffer.from('fake-image');
    const { items } = await geminiService.analyzeImage(buf, 'image/jpeg');

    expect(items).toEqual([]);
  });

  it('defaults invalid category to other', async () => {
    const payload = JSON.stringify({
      items: [
        {
          name: 'Objet inconnu',
          category: 'invalid_category',
          condition: 'good',
          description: 'Un objet',
          box_2d: [0, 0, 100, 100],
        },
      ],
    });
    vi.stubGlobal('fetch', mockFetchResponse(geminiApiBody(payload)));

    const buf = Buffer.from('fake-image');
    const { items } = await geminiService.analyzeImage(buf, 'image/jpeg');

    expect(items[0].category).toBe('other');
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ error: 'bad request' }, false, 400));

    const buf = Buffer.from('fake-image');
    await expect(geminiService.analyzeImage(buf, 'image/jpeg')).rejects.toThrow(
      'Gemini API error'
    );
  });
});
