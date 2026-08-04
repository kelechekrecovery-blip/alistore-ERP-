import { suggestCategory } from '../src/ai/categorize';

/** Keyless product auto-categorization (Phase 11): keyword-rule scoring. */
describe('suggestCategory', () => {
  it('classifies a phone by name', () => {
    const s = suggestCategory('iPhone 15 128GB');
    expect(s.category).toBe('Смартфоны');
    expect(s.matched).toContain('iphone');
    expect(s.confidence).toBeGreaterThan(0);
  });

  it('uses string attributes as signal', () => {
    const s = suggestCategory('AW-9', { тип: 'наушники', brand: 'AirPods' });
    expect(s.category).toBe('Аудио');
  });

  it('falls back to «Разное» when nothing matches', () => {
    const s = suggestCategory('Неведомый гаджет XYZ');
    expect(s.category).toBe('Разное');
    expect(s.confidence).toBe(0);
  });

  it('lists alternatives when several categories fire', () => {
    const s = suggestCategory('Samsung Galaxy Tab', {});
    // "samsung" → Смартфоны, "tab"/"galaxy" ambiguous; top wins, other listed
    expect(['Смартфоны', 'Планшеты']).toContain(s.category);
    expect(Array.isArray(s.alternatives)).toBe(true);
  });
});
