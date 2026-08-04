import { buildRevenueTrend, previousWindowStartMs, revenueWindowStartMs } from '../src/reports/revenue-buckets';

/** Period-over-period revenue trend (Phase 8). */
describe('buildRevenueTrend', () => {
  it('computes a positive delta when revenue grows', () => {
    const t = buildRevenueTrend(120000, 100000);
    expect(t.direction).toBe('up');
    expect(t.deltaPct).toBe(20);
  });

  it('computes a negative delta when revenue falls', () => {
    const t = buildRevenueTrend(80000, 100000);
    expect(t.direction).toBe('down');
    expect(t.deltaPct).toBe(-20);
  });

  it('reports flat when unchanged', () => {
    const t = buildRevenueTrend(50000, 50000);
    expect(t.direction).toBe('flat');
    expect(t.deltaPct).toBe(0);
  });

  it('returns null delta when there is no baseline (avoids ∞%)', () => {
    const t = buildRevenueTrend(40000, 0);
    expect(t.deltaPct).toBeNull();
    expect(t.direction).toBe('up');
  });

  it('rounds delta to one decimal', () => {
    const t = buildRevenueTrend(100000, 30000);
    expect(t.deltaPct).toBe(233.3);
  });
});

describe('previousWindowStartMs', () => {
  it('sits exactly N days before the current window start', () => {
    const now = new Date('2026-07-07T10:00:00Z');
    const days = 7;
    const cur = revenueWindowStartMs(days, now);
    const prev = previousWindowStartMs(days, now);
    expect(cur - prev).toBe(days * 24 * 60 * 60 * 1000);
  });
});
