import type { LlmMessage } from './llm/llm-client';

export interface CategorySuggestion {
  category: string;
  confidence: number; // 0–1
  matched: string[]; // keywords that fired
  alternatives: { category: string; score: number }[];
}

/** Keyword → category rules (RU/EN). Order is not significant; scoring decides. */
const RULES: { category: string; keywords: string[] }[] = [
  { category: 'Смартфоны', keywords: ['iphone', 'galaxy', 'samsung', 'pixel', 'redmi', 'xiaomi', 'смартфон', 'phone', 'телефон'] },
  { category: 'Ноутбуки', keywords: ['macbook', 'ноутбук', 'laptop', 'thinkpad', 'zenbook', 'notebook'] },
  { category: 'Планшеты', keywords: ['ipad', 'планшет', 'tab', 'tablet'] },
  { category: 'Аудио', keywords: ['airpods', 'наушник', 'headphone', 'buds', 'audio', 'колонк', 'speaker', 'jbl'] },
  { category: 'Часы', keywords: ['watch', 'часы', 'band', 'смарт-часы'] },
];

/**
 * Rule-based product auto-categorization (Phase 11, keyless). Scores the product's name
 * and string attributes against keyword rules and returns the best category with a
 * confidence. Pure — a LLM classifier plugs in behind the same port when a key is set.
 */
export function suggestCategory(name: string, attrs: Record<string, unknown> = {}): CategorySuggestion {
  const hay = [name, ...Object.values(attrs).filter((v) => typeof v === 'string')]
    .join(' ')
    .toLowerCase();

  const scored = RULES.map((r) => {
    const matched = r.keywords.filter((k) => hay.includes(k));
    return { category: r.category, score: matched.length, matched };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const totalHits = scored.reduce((s, x) => s + x.score, 0);

  if (!top || top.score === 0) {
    return { category: 'Разное', confidence: 0, matched: [], alternatives: [] };
  }

  return {
    category: top.category,
    confidence: Math.round((top.score / totalHits) * 100) / 100,
    matched: top.matched,
    alternatives: scored.filter((x) => x !== top && x.score > 0).map((x) => ({ category: x.category, score: x.score })),
  };
}

/** The stable category taxonomy the classifier must pick from (rules + catch-all). */
export const CATEGORY_NAMES: string[] = [...RULES.map((r) => r.category), 'Разное'];

/** JSON Schema constraining the LLM classifier to the known taxonomy. */
export const CATEGORIZE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: CATEGORY_NAMES },
    confidence: { type: 'number' },
    matched: { type: 'array', items: { type: 'string' } },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { category: { type: 'string', enum: CATEGORY_NAMES }, score: { type: 'number' } },
        required: ['category', 'score'],
      },
    },
  },
  required: ['category', 'confidence', 'matched', 'alternatives'],
};

export const CATEGORIZE_SYSTEM = [
  'Ты классифицируешь товары магазина электроники по фиксированному списку категорий:',
  `${CATEGORY_NAMES.join(', ')}.`,
  'Верни строгую категорию из списка, confidence 0..1, matched — слова/признаки из названия и атрибутов,',
  'на основании которых выбрана категория, и alternatives — другие вероятные категории со score 0..1.',
  'Если товар не подходит ни под одну — категория «Разное». Не выдумывай категорий вне списка.',
].join(' ');

export function buildCategorizeMessages(name: string, attrs: Record<string, unknown> = {}): LlmMessage[] {
  return [{ role: 'user', content: `Товар (JSON):\n${JSON.stringify({ name, attrs })}` }];
}

/** Coerce an LLM classifier reply into a validated CategorySuggestion, or return `null`. */
export function coerceCategorySuggestion(parsed: unknown): CategorySuggestion | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as { category?: unknown; confidence?: unknown; matched?: unknown; alternatives?: unknown };
  if (typeof raw.category !== 'string' || !CATEGORY_NAMES.includes(raw.category)) return null;
  const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
  const matched = Array.isArray(raw.matched) ? raw.matched.filter((v): v is string => typeof v === 'string').slice(0, 12) : [];
  const alternatives = Array.isArray(raw.alternatives)
    ? raw.alternatives
        .map((a) => (a && typeof a === 'object' ? (a as { category?: unknown; score?: unknown }) : null))
        .filter((a): a is { category: unknown; score: unknown } => a !== null)
        .filter((a) => typeof a.category === 'string' && CATEGORY_NAMES.includes(a.category as string))
        .map((a) => ({ category: a.category as string, score: typeof a.score === 'number' ? a.score : 0 }))
        .slice(0, 4)
    : [];
  return { category: raw.category, confidence: Math.round(confidence * 100) / 100, matched, alternatives };
}
