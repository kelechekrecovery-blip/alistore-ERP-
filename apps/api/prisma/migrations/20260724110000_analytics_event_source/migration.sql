-- Attribution source (last-touch UTM) on funnel events, so campaign ROI can be
-- broken down by the source that drove the view/cart/checkout — closing the loop
-- between analytics and campaigns.

ALTER TABLE "AnalyticsEvent" ADD COLUMN "source" TEXT;

CREATE INDEX "AnalyticsEvent_source_ts_idx" ON "AnalyticsEvent"("source", "ts");
