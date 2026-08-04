-- First-party storefront funnel, separate from the Event Ledger (AuditEvent).
-- Marketing telemetry is high-volume and non-financial; it must not share the
-- table reports read as money/stock/status truth.

CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "customerId" TEXT,
    "productId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_type_ts_idx" ON "AnalyticsEvent"("type", "ts");
CREATE INDEX "AnalyticsEvent_productId_idx" ON "AnalyticsEvent"("productId");
