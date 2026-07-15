CREATE TYPE "CampaignFunnelStage" AS ENUM ('click', 'visit', 'checkout', 'conversion');

ALTER TABLE "OrderAttribution"
  ADD COLUMN "journeyHash" TEXT,
  ADD COLUMN "refundedRevenue" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundedCost" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CampaignFunnelEvent" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "sessionHash" TEXT NOT NULL,
  "stage" "CampaignFunnelStage" NOT NULL,
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignFunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignRefundAdjustment" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "attributionId" TEXT NOT NULL,
  "refundPaymentId" TEXT NOT NULL,
  "returnId" TEXT,
  "revenue" INTEGER NOT NULL,
  "restoredCost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRefundAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignFunnelEvent_campaignId_sessionHash_stage_key"
  ON "CampaignFunnelEvent"("campaignId", "sessionHash", "stage");
CREATE INDEX "CampaignFunnelEvent_campaignId_stage_createdAt_idx"
  ON "CampaignFunnelEvent"("campaignId", "stage", "createdAt");
CREATE INDEX "CampaignFunnelEvent_orderId_idx" ON "CampaignFunnelEvent"("orderId");

CREATE UNIQUE INDEX "CampaignRefundAdjustment_refundPaymentId_key"
  ON "CampaignRefundAdjustment"("refundPaymentId");
CREATE INDEX "CampaignRefundAdjustment_campaignId_createdAt_idx"
  ON "CampaignRefundAdjustment"("campaignId", "createdAt");
CREATE INDEX "CampaignRefundAdjustment_attributionId_createdAt_idx"
  ON "CampaignRefundAdjustment"("attributionId", "createdAt");

ALTER TABLE "CampaignFunnelEvent"
  ADD CONSTRAINT "CampaignFunnelEvent_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignRefundAdjustment"
  ADD CONSTRAINT "CampaignRefundAdjustment_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignRefundAdjustment"
  ADD CONSTRAINT "CampaignRefundAdjustment_attributionId_fkey"
  FOREIGN KEY ("attributionId") REFERENCES "OrderAttribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
