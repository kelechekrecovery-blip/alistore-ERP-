/**
 * First-party storefront funnel events.
 *
 * These land in their OWN table (`AnalyticsEvent`), never in the Event Ledger
 * (`AuditEvent`): the ledger is the money/stock/status spine (Invariant #10) that
 * reports read as truth, and high-volume marketing telemetry has no business
 * bloating it. The data is still the owner's — a private table, not an external
 * tracker like gtag.
 *
 * The list is closed on purpose: ingestion is public, so an unknown type is
 * rejected rather than stored (see AnalyticsService.record).
 */
export const ANALYTICS_EVENT_TYPES = ['product_view', 'add_to_cart', 'checkout_started'] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export function isAnalyticsEventType(value: string): value is AnalyticsEventType {
  return (ANALYTICS_EVENT_TYPES as readonly string[]).includes(value);
}
