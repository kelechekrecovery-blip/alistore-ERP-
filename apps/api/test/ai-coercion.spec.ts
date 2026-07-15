import { coerceCategorySuggestion, CATEGORY_NAMES } from '../src/ai/categorize';
import { coerceInsights } from '../src/ai/insight-provider';
import { coerceModeration, moderateByRules } from '../src/ai/moderation';

describe('coerceCategorySuggestion (LLM classifier output)', () => {
  it('accepts a valid reply within the taxonomy', () => {
    const s = coerceCategorySuggestion({
      category: 'Смартфоны',
      confidence: 1.4, // clamped
      matched: ['iphone'],
      alternatives: [{ category: 'Планшеты', score: 0.2 }],
    });
    expect(s).toEqual({ category: 'Смартфоны', confidence: 1, matched: ['iphone'], alternatives: [{ category: 'Планшеты', score: 0.2 }] });
  });

  it('rejects categories outside the fixed taxonomy', () => {
    expect(coerceCategorySuggestion({ category: 'Дроны', confidence: 0.9, matched: [], alternatives: [] })).toBeNull();
    expect(coerceCategorySuggestion('nope')).toBeNull();
  });

  it('exposes the catch-all category', () => {
    expect(CATEGORY_NAMES).toContain('Разное');
  });
});

describe('coerceInsights (structured owner insights)', () => {
  it('validates items, defaults unknown tone to info, caps at 8', () => {
    const insights = coerceInsights({
      insights: [
        { tone: 'warning', title: 'Дефицит', detail: 'Закупить AirPods' },
        { tone: 'weird', title: 'X', detail: 'Y' },
        { title: 'no tone', detail: 'ok' },
      ],
    });
    expect(insights[0]).toEqual({ tone: 'warning', title: 'Дефицит', detail: 'Закупить AirPods' });
    expect(insights[1].tone).toBe('info');
    expect(insights.length).toBe(3);
  });

  it('throws when the array is missing or empty so the caller can fall back to rules', () => {
    expect(() => coerceInsights({})).toThrow();
    expect(() => coerceInsights({ insights: [{ tone: 'info' }] })).toThrow();
  });
});

describe('moderation', () => {
  it('rule fallback flags profanity and passes normal criticism', () => {
    expect(moderateByRules('Отличный телефон, рекомендую').allowed).toBe(true);
    const bad = moderateByRules('это fuck полный shit');
    expect(bad.allowed).toBe(false);
    expect(bad.categories).toContain('profanity');
  });

  it('coerceModeration validates the LLM verdict', () => {
    expect(coerceModeration({ allowed: false, categories: ['spam'], reason: 'ссылка' }, 'anthropic:x')).toEqual({
      allowed: false,
      categories: ['spam'],
      reason: 'ссылка',
      source: 'anthropic:x',
    });
    expect(coerceModeration({ categories: [] }, 'x')).toBeNull();
  });
});
