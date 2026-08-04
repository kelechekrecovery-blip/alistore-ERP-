CREATE TYPE "CampaignLifecycleStatus" AS ENUM ('draft', 'review', 'approved', 'active', 'paused', 'completed');
CREATE TYPE "CampaignCreativeType" AS ENUM ('text', 'image', 'video');
ALTER TYPE "OutboxStatus" ADD VALUE 'cancelled';

ALTER TABLE "Campaign"
  ADD COLUMN "status" "CampaignLifecycleStatus" NOT NULL DEFAULT 'draft',
  ADD COLUMN "creativeType" "CampaignCreativeType" NOT NULL DEFAULT 'text',
  ADD COLUMN "creativeHeadline" TEXT,
  ADD COLUMN "creativeBody" TEXT,
  ADD COLUMN "creativeAssetUrl" TEXT,
  ADD COLUMN "creativeCtaLabel" TEXT,
  ADD COLUMN "destinationUrl" TEXT NOT NULL DEFAULT '/',
  ADD COLUMN "template" TEXT NOT NULL DEFAULT 'campaign_offer',
  ADD COLUMN "approvalId" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "createdBy" TEXT,
  ADD COLUMN "updatedBy" TEXT,
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "pausedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Campaign"
SET
  "status" = 'active',
  "creativeHeadline" = "name",
  "createdBy" = 'legacy',
  "updatedBy" = 'legacy',
  "activatedAt" = "createdAt";

ALTER TABLE "Campaign"
  ALTER COLUMN "creativeHeadline" SET NOT NULL,
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

CREATE UNIQUE INDEX "Campaign_approvalId_key" ON "Campaign"("approvalId");
CREATE INDEX "Campaign_status_createdAt_idx" ON "Campaign"("status", "createdAt");

CREATE TABLE "CampaignSpendEntry" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalRef" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "actor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignSpendEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignSpendEntry_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "CampaignSpendEntry_idempotencyKey_key" ON "CampaignSpendEntry"("idempotencyKey");
CREATE UNIQUE INDEX "CampaignSpendEntry_provider_externalRef_key" ON "CampaignSpendEntry"("provider", "externalRef");
CREATE INDEX "CampaignSpendEntry_campaignId_occurredAt_idx" ON "CampaignSpendEntry"("campaignId", "occurredAt");
ALTER TABLE "CampaignSpendEntry"
  ADD CONSTRAINT "CampaignSpendEntry_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OutboxMessage" ADD COLUMN "campaignId" TEXT;
CREATE INDEX "OutboxMessage_campaignId_status_idx" ON "OutboxMessage"("campaignId", "status");
ALTER TABLE "OutboxMessage"
  ADD CONSTRAINT "OutboxMessage_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
