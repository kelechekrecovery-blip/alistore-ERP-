import { businessDayIso, businessDayStartMs, parseBusinessDay } from '../common/business-time';

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Сутки отчётов — местные (TZ-001). Раньше здесь был UTC, что для UTC+6 означало
 * окно 06:00 → 06:00 по Бишкеку: ночная операция уезжала в предыдущий день.
 * Границы и подписи бакетов обязаны жить в одном поясе, иначе платёж попадёт в
 * окно запроса, но не найдёт свой бакет.
 */
export { parseBusinessDay };

/** Start (ms) of an N-day window ending today inclusive — the query lower bound. */
export function revenueWindowStartMs(days: number, now: Date): number {
  return businessDayStartMs(now) - (days - 1) * DAY_MS;
}

/** Start (ms) of the N-day window immediately BEFORE the current one — the baseline. */
export function previousWindowStartMs(days: number, now: Date): number {
  return revenueWindowStartMs(days, now) - days * DAY_MS;
}

export interface RevenueTrend {
  current: number;
  previous: number;
  deltaPct: number | null; // null when there is no baseline (previous = 0)
  direction: 'up' | 'down' | 'flat';
}

/**
 * Period-over-period revenue trend: current window vs the equal window before it.
 * Pure — the caller supplies both totals. deltaPct is null when the baseline is 0
 * (can't divide), so the UI shows «нов.» instead of a bogus ∞%.
 */
export function buildRevenueTrend(current: number, previous: number): RevenueTrend {
  const deltaPct = previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
  const direction = current > previous ? 'up' : current < previous ? 'down' : 'flat';
  return { current, previous, deltaPct, direction };
}

/**
 * Bucket positive payments into one entry per day for the last N days, in the
 * business timezone, so a sale made after local midnight lands on its own day.
 * Pure — the caller supplies the rows.
 */
export function buildRevenueBuckets(
  payments: { amount: number; createdAt: Date }[],
  days: number,
  now: Date,
): { day: string; amount: number }[] {
  const startMs = revenueWindowStartMs(days, now);
  const buckets: { day: string; amount: number }[] = [];
  for (let i = 0; i < days; i += 1) {
    buckets.push({ day: businessDayIso(new Date(startMs + i * DAY_MS)), amount: 0 });
  }
  for (const p of payments) {
    const key = businessDayIso(p.createdAt);
    const b = buckets.find((x) => x.day === key);
    if (b) b.amount += p.amount;
  }
  return buckets;
}

/**
 * One bucket per day across an arbitrary [startMs, endMs] range (both local
 * midnights, inclusive). Pure — the caller supplies the rows already scoped to the range.
 */
export function buildRangeBuckets(
  payments: { amount: number; createdAt: Date }[],
  startMs: number,
  endMs: number,
): { day: string; amount: number }[] {
  const dayCount = Math.floor((endMs - startMs) / DAY_MS) + 1;
  const buckets: { day: string; amount: number }[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    buckets.push({ day: businessDayIso(new Date(startMs + i * DAY_MS)), amount: 0 });
  }
  for (const p of payments) {
    const key = businessDayIso(p.createdAt);
    const b = buckets.find((x) => x.day === key);
    if (b) b.amount += p.amount;
  }
  return buckets;
}
