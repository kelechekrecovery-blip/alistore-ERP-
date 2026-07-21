import {
  DEFAULT_TOOL_MAX_ITEMS,
  serializeToolResult,
} from '../src/ai/tool-budget';

/**
 * Кокпит ERP платил за Opus на каждом открытии, и платил по нарастающей.
 *
 * Агентный ассистент крутит до семи обращений подряд, и каждый результат
 * инструмента остаётся в переписке — входной контекст растёт квадратично. При
 * этом `get_pricing_review` и `get_reorder_review` отдавали рекомендацию по
 * КАЖДОМУ неархивному товару и уходили в модель целиком: на каталоге в
 * несколько тысяч SKU это мегабайты JSON на итерацию. Ни лимита, ни квоты, ни
 * бюджета токенов не было.
 */
describe('AI · потолок объёма на результат инструмента', () => {
  it('длинный список режется до лимита', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ sku: `SKU-${i}`, advice: 'raise' }));

    const parsed = JSON.parse(serializeToolResult(rows)) as unknown[];

    expect(parsed).toHaveLength(DEFAULT_TOOL_MAX_ITEMS + 1);
  });

  /**
   * Молчаливая обрезка опаснее самой обрезки: модель увидит короткий список и
   * уверенно скажет владельцу «дефицита нет».
   */
  it('модели сообщается, что список усечён и сколько всего было', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ sku: `SKU-${i}` }));

    const parsed = JSON.parse(serializeToolResult(rows)) as Array<Record<string, unknown>>;
    const marker = parsed[parsed.length - 1];

    expect(marker.truncated).toBe(true);
    expect(marker.total).toBe(500);
    expect(String(marker.note)).toMatch(/усечён/);
  });

  it('массивы внутри объекта тоже режутся — отчёты приходят обёрнутыми', () => {
    const payload = { generatedAt: '2026-07-21', items: Array.from({ length: 100 }, (_, i) => i) };

    const parsed = JSON.parse(serializeToolResult(payload)) as { generatedAt: string; items: unknown[] };

    expect(parsed.generatedAt).toBe('2026-07-21');
    expect(parsed.items).toHaveLength(DEFAULT_TOOL_MAX_ITEMS + 1);
  });

  it('короткий ответ не трогаем', () => {
    expect(serializeToolResult({ revenue: 100, orders: 3 })).toBe('{"revenue":100,"orders":3}');
  });

  /**
   * Последний рубеж: элементов мало, но каждый огромен.
   */
  it('жёсткий предел по символам срабатывает даже при малом числе элементов', () => {
    const fat = [{ note: 'x'.repeat(50_000) }];

    const out = serializeToolResult(fat, { maxChars: 1_000 });

    expect(out.length).toBeLessThan(1_100);
    expect(out).toMatch(/ОБРЕЗАНО/);
  });
});
