import { DAY_MS, parseUtcDay } from '../src/reports/revenue-buckets';

/**
 * TZ-001 (docs/GAP-360-CODEX.md): отчёты и payroll режут сутки по UTC, а
 * логистика уже живёт в `Asia/Bishkek` (`logistics.service.ts`). Магазин один и
 * стоит в UTC+6, поэтому «сутки» в Z-отчёте — это 06:00 сегодня → 06:00 завтра
 * по местному времени.
 *
 * Днём это незаметно: обычная торговля с 09:00 до 22:00 целиком укладывается в
 * те же UTC-сутки. Расходится только то, что происходит между 00:00 и 06:00 —
 * поздняя инкассация, ночная смена, ночной онлайн-заказ. Такая операция уезжает
 * в отчёт за ПРЕДЫДУЩИЙ день.
 *
 * Тест характеризующий: он фиксирует поведение, которое есть сейчас, а не то,
 * которое считается правильным. Когда границу переведут на бизнес-часовой пояс,
 * он упадёт — и это должно быть осознанным решением, а не тихой правкой: смена
 * границы переписывает уже выгруженные дневные цифры задним числом.
 */
describe('Report day boundary (TZ-001 characterisation)', () => {
  const BISHKEK_OFFSET_MS = 6 * 60 * 60 * 1000;
  /** Момент времени по местным часам магазина, в UTC-миллисекундах. */
  const localBishkek = (y: number, m: number, d: number, h: number, min = 0) =>
    Date.UTC(y, m - 1, d, h, min) - BISHKEK_OFFSET_MS;

  const inReportFor = (dayIso: string, atMs: number) => {
    const start = parseUtcDay(dayIso)!;
    return atMs >= start && atMs < start + DAY_MS;
  };

  it('обычный торговый день попадает в свои сутки — поэтому дефект и не виден', () => {
    expect(inReportFor('2026-07-26', localBishkek(2026, 7, 26, 10))).toBe(true);
    expect(inReportFor('2026-07-26', localBishkek(2026, 7, 26, 21, 30))).toBe(true);
  });

  it('операция после полуночи уезжает в отчёт за предыдущий день', () => {
    const afterMidnight = localBishkek(2026, 7, 26, 2);
    expect(inReportFor('2026-07-26', afterMidnight)).toBe(false);
    expect(inReportFor('2026-07-25', afterMidnight)).toBe(true);
  });

  it('и наоборот: раннее утро следующего дня считается текущими сутками', () => {
    const earlyNextDay = localBishkek(2026, 7, 27, 5, 59);
    expect(inReportFor('2026-07-26', earlyNextDay)).toBe(true);
  });

  it('окно суток по UTC — это 06:00–06:00 по Бишкеку', () => {
    const start = parseUtcDay('2026-07-26')!;
    expect(start).toBe(localBishkek(2026, 7, 26, 6));
    expect(start + DAY_MS).toBe(localBishkek(2026, 7, 27, 6));
  });
});
