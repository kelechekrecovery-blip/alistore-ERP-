import { buildRangeBuckets, parseUtcDay } from '../src/reports/revenue-buckets';

/** Arbitrary date-range revenue bucketing (Phase 8). */
describe('parseUtcDay', () => {
  it('parses a valid YYYY-MM-DD to UTC midnight', () => {
    expect(parseUtcDay('2026-06-01')).toBe(Date.UTC(2026, 5, 1));
  });

  it('rejects malformed strings', () => {
    expect(parseUtcDay('2026/06/01')).toBeNull();
    expect(parseUtcDay('06-01-2026')).toBeNull();
    expect(parseUtcDay('not-a-date')).toBeNull();
  });

  it('rejects impossible calendar dates (no silent rollover)', () => {
    expect(parseUtcDay('2026-13-01')).toBeNull();
    expect(parseUtcDay('2026-02-30')).toBeNull();
  });
});

describe('buildRangeBuckets', () => {
  const from = Date.UTC(2026, 5, 1); // 2026-06-01
  const to = Date.UTC(2026, 5, 3); // 2026-06-03

  it('makes one bucket per day across the inclusive range', () => {
    const b = buildRangeBuckets([], from, to);
    expect(b.map((x) => x.day)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(b.every((x) => x.amount === 0)).toBe(true);
  });

  it('sums payments into the right day and ignores out-of-range rows', () => {
    const b = buildRangeBuckets(
      [
        { amount: 1000, createdAt: new Date('2026-06-01T09:00:00Z') },
        { amount: 500, createdAt: new Date('2026-06-01T20:00:00Z') },
        { amount: 700, createdAt: new Date('2026-06-03T05:00:00Z') },
        { amount: 999, createdAt: new Date('2026-07-01T00:00:00Z') }, // outside range → dropped
      ],
      from,
      to,
    );
    expect(b.find((x) => x.day === '2026-06-01')?.amount).toBe(1500);
    expect(b.find((x) => x.day === '2026-06-02')?.amount).toBe(0);
    expect(b.find((x) => x.day === '2026-06-03')?.amount).toBe(700);
    expect(b.reduce((s, x) => s + x.amount, 0)).toBe(2200);
  });

  it('handles a single-day range', () => {
    const b = buildRangeBuckets([{ amount: 300, createdAt: new Date('2026-06-01T12:00:00Z') }], from, from);
    expect(b).toHaveLength(1);
    expect(b[0]).toEqual({ day: '2026-06-01', amount: 300 });
  });
});
