import { warrantyCoverage, WARRANTY_COVERAGE_MONTHS } from '../src/customers/warranty-coverage';

/** Pure warranty-coverage math: coverage-end = purchase + 12 months; daysLeft floors at 0. */
describe('warrantyCoverage', () => {
  it('returns null when the purchase date is unknown', () => {
    expect(warrantyCoverage(undefined)).toBeNull();
  });

  it('adds the coverage window and computes days remaining', () => {
    const purchased = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-07-01T00:00:00Z');
    const cover = warrantyCoverage(purchased, now)!;
    expect(cover.until.getUTCFullYear()).toBe(2027);
    expect(cover.until.getUTCMonth()).toBe(0); // January (12 months on from Jan)
    expect(cover.daysLeft).toBe(184); // 2026-07-01 → 2027-01-01
  });

  it('floors days remaining at zero once coverage has lapsed', () => {
    const purchased = new Date('2024-01-01T00:00:00Z');
    const now = new Date('2026-07-07T00:00:00Z');
    expect(warrantyCoverage(purchased, now)!.daysLeft).toBe(0);
  });

  it('uses a 12-month window', () => {
    expect(WARRANTY_COVERAGE_MONTHS).toBe(12);
  });
});
