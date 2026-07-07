/** Standard manufacturer warranty window (months) from the purchase date. */
export const WARRANTY_COVERAGE_MONTHS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Warranty coverage for a purchased unit: the coverage-end date and days remaining.
 * Returns null when the purchase date is unknown. Pure — `now` is injectable for tests.
 */
export function warrantyCoverage(
  purchasedAt: Date | undefined,
  now: Date = new Date(),
): { until: Date; daysLeft: number } | null {
  if (!purchasedAt) return null;
  const until = new Date(purchasedAt);
  until.setMonth(until.getMonth() + WARRANTY_COVERAGE_MONTHS);
  const daysLeft = Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS));
  return { until, daysLeft };
}
