CREATE TYPE "FixedAssetStatus" AS ENUM ('active', 'fully_depreciated', 'disposed');

INSERT INTO "AccountingAccount" ("code", "name", "type", "system", "active") VALUES
  ('1400', 'Основные средства', 'asset', true, true),
  ('1410', 'Накопленная амортизация', 'asset', true, true),
  ('6700', 'Расходы на амортизацию', 'expense', true, true)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "assetNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serialNumber" TEXT,
    "acquisitionCost" INTEGER NOT NULL,
    "accumulatedDepreciation" INTEGER NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "inServiceAt" TIMESTAMP(3) NOT NULL,
    "fundingAccountCode" TEXT NOT NULL,
    "externalRef" TEXT,
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'active',
    "idempotencyKey" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "acquisitionAccountingEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FixedAssetDepreciation" (
    "id" TEXT NOT NULL,
    "fixedAssetId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "openingAccumulated" INTEGER NOT NULL,
    "closingAccumulated" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "accountingEntryId" TEXT NOT NULL,
    "postedBy" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FixedAssetDepreciation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixedAsset_assetNumber_key" ON "FixedAsset"("assetNumber");
CREATE UNIQUE INDEX "FixedAsset_idempotencyKey_key" ON "FixedAsset"("idempotencyKey");
CREATE UNIQUE INDEX "FixedAsset_acquisitionAccountingEntryId_key" ON "FixedAsset"("acquisitionAccountingEntryId");
CREATE INDEX "FixedAsset_status_inServiceAt_idx" ON "FixedAsset"("status", "inServiceAt");
CREATE INDEX "FixedAsset_category_createdAt_idx" ON "FixedAsset"("category", "createdAt");

CREATE UNIQUE INDEX "FixedAssetDepreciation_idempotencyKey_key" ON "FixedAssetDepreciation"("idempotencyKey");
CREATE UNIQUE INDEX "FixedAssetDepreciation_accountingEntryId_key" ON "FixedAssetDepreciation"("accountingEntryId");
CREATE UNIQUE INDEX "FixedAssetDepreciation_fixedAssetId_period_key" ON "FixedAssetDepreciation"("fixedAssetId", "period");
CREATE INDEX "FixedAssetDepreciation_period_postedAt_idx" ON "FixedAssetDepreciation"("period", "postedAt");

ALTER TABLE "FixedAsset"
  ADD CONSTRAINT "FixedAsset_acquisitionAccountingEntryId_fkey"
  FOREIGN KEY ("acquisitionAccountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FixedAssetDepreciation"
  ADD CONSTRAINT "FixedAssetDepreciation_fixedAssetId_fkey"
  FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FixedAssetDepreciation_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
