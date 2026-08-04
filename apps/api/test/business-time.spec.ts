import {
  BUSINESS_TIME_ZONE,
  BUSINESS_UTC_OFFSET,
  businessDayIso,
  businessDayStartMs,
  parseBusinessDay,
} from '../src/common/business-time';

/**
 * TZ-001. Магазин один и стоит в UTC+6. Отчёты резали сутки по UTC, то есть
 * фактически с 06:00 до 06:00 по местному, и всё, что происходило между
 * полуночью и шестью утра, уезжало в предыдущий день. Логистика при этом уже
 * считала сутки по Asia/Bishkek — рассинхрон внутри одной системы.
 *
 * В Кыргызстане нет перехода на летнее время (фиксированный UTC+6 с 2005 года),
 * поэтому смещение задано константой, а не вычисляется — это точно и не зависит
 * от базы часовых поясов рантайма.
 */
describe('business time (Asia/Bishkek)', () => {
  const OFFSET_MS = 6 * 60 * 60 * 1000;
  const localBishkek = (y: number, m: number, d: number, h: number, min = 0) =>
    Date.UTC(y, m - 1, d, h, min) - OFFSET_MS;

  it('объявляет тот же пояс, что и логистика', () => {
    expect(BUSINESS_TIME_ZONE).toBe('Asia/Bishkek');
    expect(BUSINESS_UTC_OFFSET).toBe('+06:00');
  });

  it('начало суток — местная полночь, а не UTC', () => {
    expect(parseBusinessDay('2026-07-26')).toBe(localBishkek(2026, 7, 26, 0));
    expect(parseBusinessDay('2026-07-26')).not.toBe(Date.UTC(2026, 6, 26));
  });

  it('операция после полуночи принадлежит своему местному дню', () => {
    expect(businessDayIso(new Date(localBishkek(2026, 7, 26, 2)))).toBe('2026-07-26');
  });

  it('раннее утро следующего дня больше не считается текущими сутками', () => {
    expect(businessDayIso(new Date(localBishkek(2026, 7, 27, 5, 59)))).toBe('2026-07-27');
  });

  it('обычный торговый день не меняется', () => {
    expect(businessDayIso(new Date(localBishkek(2026, 7, 26, 10)))).toBe('2026-07-26');
    expect(businessDayIso(new Date(localBishkek(2026, 7, 26, 21, 30)))).toBe('2026-07-26');
  });

  it('«сегодня» берётся по местным часам', () => {
    // 2026-07-26 01:00 по Бишкеку — это ещё 25 июля по UTC.
    const afterLocalMidnight = new Date(localBishkek(2026, 7, 26, 1));
    expect(afterLocalMidnight.toISOString().slice(0, 10)).toBe('2026-07-25');
    expect(businessDayStartMs(afterLocalMidnight)).toBe(localBishkek(2026, 7, 26, 0));
  });

  it('отвергает мусор и несуществующие даты', () => {
    expect(parseBusinessDay('2026-13-01')).toBeNull();
    expect(parseBusinessDay('2026-02-30')).toBeNull();
    expect(parseBusinessDay('26-07-2026')).toBeNull();
    expect(parseBusinessDay('')).toBeNull();
  });
});
