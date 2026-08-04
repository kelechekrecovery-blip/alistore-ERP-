import { DAY_MS, parseBusinessDay } from '../src/reports/revenue-buckets';

/**
 * TZ-001 — исправлено. Раньше отчёты резали сутки по UTC, что для UTC+6 давало
 * окно 06:00 → 06:00 по Бишкеку: поздняя инкассация, ночная смена и ночной заказ
 * уезжали в отчёт за ПРЕДЫДУЩИЙ день, а логистика при этом уже жила в
 * `Asia/Bishkek`. Теперь граница одна на всю систему — местная полночь.
 *
 * Тест держит именно те случаи, которые были сломаны, а не только счастливый
 * путь: если кто-то вернёт UTC-границу, упадут второй и третий кейсы.
 */
describe('Report day boundary (business timezone)', () => {
  const BISHKEK_OFFSET_MS = 6 * 60 * 60 * 1000;
  const localBishkek = (y: number, m: number, d: number, h: number, min = 0) =>
    Date.UTC(y, m - 1, d, h, min) - BISHKEK_OFFSET_MS;

  const inReportFor = (dayIso: string, atMs: number) => {
    const start = parseBusinessDay(dayIso)!;
    return atMs >= start && atMs < start + DAY_MS;
  };

  it('обычный торговый день попадает в свои сутки', () => {
    expect(inReportFor('2026-07-26', localBishkek(2026, 7, 26, 10))).toBe(true);
    expect(inReportFor('2026-07-26', localBishkek(2026, 7, 26, 21, 30))).toBe(true);
  });

  it('операция после полуночи остаётся в своём дне (была регрессия)', () => {
    const afterMidnight = localBishkek(2026, 7, 26, 2);
    expect(inReportFor('2026-07-26', afterMidnight)).toBe(true);
    expect(inReportFor('2026-07-25', afterMidnight)).toBe(false);
  });

  it('раннее утро следующего дня больше не засчитывается в текущие сутки', () => {
    const earlyNextDay = localBishkek(2026, 7, 27, 5, 59);
    expect(inReportFor('2026-07-26', earlyNextDay)).toBe(false);
    expect(inReportFor('2026-07-27', earlyNextDay)).toBe(true);
  });

  it('окно суток — местная полночь, а не UTC', () => {
    const start = parseBusinessDay('2026-07-26')!;
    expect(start).toBe(localBishkek(2026, 7, 26, 0));
    expect(start).not.toBe(Date.UTC(2026, 6, 26));
    expect(start + DAY_MS).toBe(localBishkek(2026, 7, 27, 0));
  });
});
