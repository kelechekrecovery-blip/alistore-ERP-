CREATE TYPE "ConsignmentStatus" AS ENUM ('active', 'sold', 'settled', 'withdrawn');
CREATE TYPE "ConsignmentPayoutStatus" AS ENUM ('created', 'paid');

CREATE TABLE "ConsignmentPayout" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerContact" TEXT,
    "grossAmount" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "ownerAmount" INTEGER NOT NULL,
    "status" "ConsignmentPayoutStatus" NOT NULL DEFAULT 'created',
    "paymentKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConsignmentPayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsignmentItem" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerContact" TEXT,
    "commissionBps" INTEGER NOT NULL,
    "status" "ConsignmentStatus" NOT NULL DEFAULT 'active',
    "saleOrderId" TEXT,
    "salePrice" INTEGER,
    "commissionAmount" INTEGER,
    "ownerAmount" INTEGER,
    "soldAt" TIMESTAMP(3),
    "payoutId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConsignmentItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsignmentPayout_idempotencyKey_key" ON "ConsignmentPayout"("idempotencyKey");
CREATE UNIQUE INDEX "ConsignmentPayout_paymentKey_key" ON "ConsignmentPayout"("paymentKey");
CREATE INDEX "ConsignmentPayout_status_createdAt_idx" ON "ConsignmentPayout"("status", "createdAt");
CREATE INDEX "ConsignmentPayout_ownerName_ownerContact_idx" ON "ConsignmentPayout"("ownerName", "ownerContact");
CREATE UNIQUE INDEX "ConsignmentItem_idempotencyKey_key" ON "ConsignmentItem"("idempotencyKey");
CREATE UNIQUE INDEX "ConsignmentItem_unitId_key" ON "ConsignmentItem"("unitId");
CREATE INDEX "ConsignmentItem_status_createdAt_idx" ON "ConsignmentItem"("status", "createdAt");
CREATE INDEX "ConsignmentItem_ownerName_ownerContact_idx" ON "ConsignmentItem"("ownerName", "ownerContact");
CREATE INDEX "ConsignmentItem_saleOrderId_idx" ON "ConsignmentItem"("saleOrderId");
CREATE INDEX "ConsignmentItem_payoutId_idx" ON "ConsignmentItem"("payoutId");

ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DeviceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_saleOrderId_fkey" FOREIGN KEY ("saleOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "ConsignmentPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_commissionBps_check" CHECK ("commissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_sale_amounts_check" CHECK (
  ("status" = 'active' AND "saleOrderId" IS NULL AND "salePrice" IS NULL AND "commissionAmount" IS NULL AND "ownerAmount" IS NULL)
  OR ("status" IN ('sold', 'settled') AND "saleOrderId" IS NOT NULL AND "salePrice" >= 0 AND "commissionAmount" >= 0 AND "ownerAmount" >= 0 AND "salePrice" = "commissionAmount" + "ownerAmount")
  OR ("status" = 'withdrawn' AND "saleOrderId" IS NULL)
);
ALTER TABLE "ConsignmentPayout" ADD CONSTRAINT "ConsignmentPayout_amounts_check" CHECK (
  "grossAmount" >= 0 AND "commissionAmount" >= 0 AND "ownerAmount" >= 0 AND "grossAmount" = "commissionAmount" + "ownerAmount"
);
