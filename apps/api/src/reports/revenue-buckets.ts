export const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a strict YYYY-MM-DD string to its UTC-midnight ms, or null if invalid. */
export function parseUtcDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  // Reject rollovers like 2026-13-01 / 2026-02-30 (Date.UTC normalizes instead of failing).
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms;
}

/** Start (ms, UTC) of an N-day window ending today inclusive — the query lower bound. */
export function revenueWindowStartMs(days: number, now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS;
}

/** Start (ms, UTC) of the N-day window immediately BEFORE the current one — the baseline. */
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
 * Bucket positive payments into one entry per day for the last N days (UTC-consistent,
 * so GMT+6 never drops today's sales). Pure — the caller supplies the rows.
 */
export function buildRevenueBuckets(
  payments: { amount: number; createdAt: Date }[],
  days: number,
  now: Date,
): { day: string; amount: number }[] {
  const startMs = revenueWindowStartMs(days, now);
  const buckets: { day: string; amount: number }[] = [];
  for (let i = 0; i < days; i += 1) {
    buckets.push({ day: new Date(startMs + i * DAY_MS).toISOString().slice(0, 10), amount: 0 });
  }
  for (const p of payments) {
    const key = p.createdAt.toISOString().slice(0, 10);
    const b = buckets.find((x) => x.day === key);
    if (b) b.amount += p.amount;
  }
  return buckets;
}

/**
 * One bucket per day across an arbitrary [startMs, endMs] range (both UTC midnights,
 * inclusive). Pure — the caller supplies the rows already scoped to the range.
 */
export function buildRangeBuckets(
  payments: { amount: number; createdAt: Date }[],
  startMs: number,
  endMs: number,
): { day: string; amount: number }[] {
  const dayCount = Math.floor((endMs - startMs) / DAY_MS) + 1;
  const buckets: { day: string; amount: number }[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    buckets.push({ day: new Date(startMs + i * DAY_MS).toISOString().slice(0, 10), amount: 0 });
  }
  for (const p of payments) {
    const key = p.createdAt.toISOString().slice(0, 10);
    const b = buckets.find((x) => x.day === key);
    if (b) b.amount += p.amount;
  }
  return buckets;
}
