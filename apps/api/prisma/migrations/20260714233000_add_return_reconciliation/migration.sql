ALTER TYPE "ConsignmentPayoutStatus" ADD VALUE IF NOT EXISTS 'cancelled';

CREATE TYPE "ConsignmentAdjustmentStatus" AS ENUM ('open', 'settled');

ALTER TABLE "Return"
  ADD COLUMN "restockLocation" TEXT,
  ADD COLUMN "restockedAt" TIMESTAMP(3);

CREATE TABLE "ConsignmentAdjustment" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "payoutId" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "ownerContact" TEXT,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ConsignmentAdjustmentStatus" NOT NULL DEFAULT 'open',
  "createdBy" TEXT NOT NULL,
  "settledBy" TEXT,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsignmentAdjustment_returnId_itemId_key"
  ON "ConsignmentAdjustment"("returnId", "itemId");
CREATE INDEX "ConsignmentAdjustment_status_createdAt_idx"
  ON "ConsignmentAdjustment"("status", "createdAt");
CREATE INDEX "ConsignmentAdjustment_payoutId_idx"
  ON "ConsignmentAdjustment"("payoutId");
CREATE INDEX "ConsignmentAdjustment_ownerName_ownerContact_idx"
  ON "ConsignmentAdjustment"("ownerName", "ownerContact");
