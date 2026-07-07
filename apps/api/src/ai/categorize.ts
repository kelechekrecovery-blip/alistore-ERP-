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
