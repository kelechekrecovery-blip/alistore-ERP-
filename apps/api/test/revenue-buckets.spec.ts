import { buildRevenueBuckets, revenueWindowStartMs } from '../src/reports/revenue-buckets';

/**
 * Pure daily revenue bucketing for the dashboard period filter.
 * Сутки — местные (Asia/Bishkek, UTC+6), см. TZ-001: `20:00Z` это уже 02:00
 * следующего дня по Бишкеку, и бакет у такого платежа — следующий.
 */
describe('buildRevenueBuckets', () => {
  const now = new Date('2026-07-07T10:00:00Z');

  it('produces one bucket per day, oldest first, ending today', () => {
    const buckets = buildRevenueBuckets([], 3, now);
    expect(buckets.map((b) => b.day)).toEqual(['2026-07-05', '2026-07-06', '2026-07-07']);
    expect(buckets.every((b) => b.amount === 0)).toBe(true);
  });

  it('sums payments into their day bucket and ignores out-of-window rows', () => {
    const buckets = buildRevenueBuckets(
      [
        { amount: 100, createdAt: new Date('2026-07-06T09:00:00Z') },
        { amount: 50, createdAt: new Date('2026-07-07T08:00:00Z') },
        // 20:00Z = 02:00 07-07 по Бишкеку → это уже следующие местные сутки.
        { amount: 25, createdAt: new Date('2026-07-06T20:00:00Z') },
        { amount: 999, createdAt: new Date('2026-07-01T00:00:00Z') }, // outside 3-day window
      ],
      3,
      now,
    );
    expect(buckets).toEqual([
      { day: '2026-07-05', amount: 0 },
      { day: '2026-07-06', amount: 100 },
      { day: '2026-07-07', amount: 75 },
    ]);
  });

  it('returns exactly N buckets', () => {
    expect(buildRevenueBuckets([], 30, now)).toHaveLength(30);
  });

  it('window start is (days-1) before today, at LOCAL midnight', () => {
    const start = revenueWindowStartMs(7, now);
    // Местная полночь 2026-07-01 — это 2026-06-30T18:00Z при UTC+6.
    expect(new Date(start).toISOString()).toBe('2026-06-30T18:00:00.000Z');
  });
});
