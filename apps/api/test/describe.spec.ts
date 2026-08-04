import { buildDescription, buildDescriptionMessages } from '../src/ai/describe';

/** Keyless product card enrichment (Phase 11). */
describe('buildDescription', () => {
  it('names the product, category and store promise', () => {
    const d = buildDescription({ name: 'iPhone 15 128GB', category: 'Смартфоны' });
    expect(d.source).toBe('template');
    expect(d.description).toContain('iPhone 15 128GB');
    expect(d.description).toContain('Смартфоны');
    expect(d.description).toContain('Гарантия 12 месяцев');
  });

  it('surfaces sale-relevant attributes as highlights, capped at 4', () => {
    const d = buildDescription({
      name: 'MacBook Pro 14',
      category: 'Ноутбуки',
      attrs: { память: '512GB', ОЗУ: '18GB', экран: '14"', процессор: 'M3', цвет: 'серый', вес: '1.6кг' },
    });
    expect(d.highlights.length).toBe(4);
    expect(d.description).toContain('512GB');
    // known keys prioritized over arbitrary ones
    expect(d.highlights.join(',')).toContain('память: 512GB');
  });

  it('works with no attributes (no highlights clause)', () => {
    const d = buildDescription({ name: 'Некий товар' });
    expect(d.highlights).toEqual([]);
    expect(d.description).toContain('Некий товар');
  });

  it('ignores non-scalar attribute values', () => {
    const d = buildDescription({ name: 'X', attrs: { specs: { nested: true }, цвет: 'чёрный' } });
    expect(d.highlights.some((h) => h.startsWith('specs:'))).toBe(false);
    expect(d.highlights).toContain('цвет: чёрный');
  });
});

describe('buildDescriptionMessages', () => {
  it('builds a system+user prompt embedding the product data', () => {
    const msgs = buildDescriptionMessages({ name: 'AirPods Pro 2', category: 'Аудио', attrs: { тип: 'наушники' } });
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].content).toContain('AirPods Pro 2');
    expect(msgs[1].content).toContain('наушники');
  });
});
