CREATE TABLE "LandedCost" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "creditAccountCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "appliedBy" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountingEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LandedCost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LandedCostAllocation" (
    "id" TEXT NOT NULL,
    "landedCostId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "baseCost" INTEGER NOT NULL,
    "allocatedAmount" INTEGER NOT NULL,
    "resultingCost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LandedCostAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LandedCost_idempotencyKey_key" ON "LandedCost"("idempotencyKey");
CREATE UNIQUE INDEX "LandedCost_documentNumber_key" ON "LandedCost"("documentNumber");
CREATE UNIQUE INDEX "LandedCost_accountingEntryId_key" ON "LandedCost"("accountingEntryId");
CREATE INDEX "LandedCost_purchaseOrderId_createdAt_idx" ON "LandedCost"("purchaseOrderId", "createdAt");
CREATE INDEX "LandedCost_supplierId_createdAt_idx" ON "LandedCost"("supplierId", "createdAt");

CREATE UNIQUE INDEX "LandedCostAllocation_landedCostId_unitId_key" ON "LandedCostAllocation"("landedCostId", "unitId");
CREATE INDEX "LandedCostAllocation_unitId_createdAt_idx" ON "LandedCostAllocation"("unitId", "createdAt");
CREATE INDEX "LandedCostAllocation_productId_createdAt_idx" ON "LandedCostAllocation"("productId", "createdAt");

ALTER TABLE "LandedCost"
  ADD CONSTRAINT "LandedCost_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LandedCost"
  ADD CONSTRAINT "LandedCost_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LandedCost"
  ADD CONSTRAINT "LandedCost_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LandedCostAllocation"
  ADD CONSTRAINT "LandedCostAllocation_landedCostId_fkey"
  FOREIGN KEY ("landedCostId") REFERENCES "LandedCost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LandedCostAllocation"
  ADD CONSTRAINT "LandedCostAllocation_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "DeviceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LandedCostAllocation"
  ADD CONSTRAINT "LandedCostAllocation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
