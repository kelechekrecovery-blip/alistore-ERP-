ALTER TABLE "OrderItem" ADD COLUMN "unitCost" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Campaign"
  ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Campaign',
  ADD COLUMN "trackingCode" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'alistore',
  ADD COLUMN "medium" TEXT,
  ADD COLUMN "promotionCode" TEXT,
  ADD COLUMN "grossProfit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Campaign"
SET "trackingCode" = 'legacy-' || "id",
    "medium" = "channel";

ALTER TABLE "Campaign"
  ALTER COLUMN "trackingCode" SET NOT NULL,
  ALTER COLUMN "medium" SET NOT NULL;

CREATE UNIQUE INDEX "Campaign_trackingCode_key" ON "Campaign"("trackingCode");
CREATE INDEX "Campaign_channel_createdAt_idx" ON "Campaign"("channel", "createdAt");
CREATE INDEX "Campaign_promotionCode_idx" ON "Campaign"("promotionCode");

CREATE TABLE "CampaignRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "consentAtSend" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignRecipient_campaignId_customerId_key"
  ON "CampaignRecipient"("campaignId", "customerId");
CREATE INDEX "CampaignRecipient_customerId_createdAt_idx"
  ON "CampaignRecipient"("customerId", "createdAt");
ALTER TABLE "CampaignRecipient"
  ADD CONSTRAINT "CampaignRecipient_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient"
  ADD CONSTRAINT "CampaignRecipient_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderAttribution" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "campaignId" TEXT,
  "firstSource" TEXT NOT NULL,
  "firstMedium" TEXT,
  "firstCampaign" TEXT,
  "firstContent" TEXT,
  "firstTerm" TEXT,
  "firstLanding" TEXT,
  "lastSource" TEXT NOT NULL,
  "lastMedium" TEXT,
  "lastCampaign" TEXT,
  "lastContent" TEXT,
  "lastTerm" TEXT,
  "lastLanding" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "convertedAt" TIMESTAMP(3),
  "revenue" INTEGER NOT NULL DEFAULT 0,
  "grossProfit" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAttribution_orderId_key" ON "OrderAttribution"("orderId");
CREATE INDEX "OrderAttribution_campaignId_convertedAt_idx"
  ON "OrderAttribution"("campaignId", "convertedAt");
CREATE INDEX "OrderAttribution_lastSource_lastMedium_idx"
  ON "OrderAttribution"("lastSource", "lastMedium");
ALTER TABLE "OrderAttribution"
  ADD CONSTRAINT "OrderAttribution_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderAttribution"
  ADD CONSTRAINT "OrderAttribution_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
