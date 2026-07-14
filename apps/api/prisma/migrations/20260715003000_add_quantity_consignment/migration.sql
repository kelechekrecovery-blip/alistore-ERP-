CREATE TABLE "QuantityConsignmentLot" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "balanceId" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "ownerContact" TEXT,
  "commissionBps" INTEGER NOT NULL,
  "receivedQty" INTEGER NOT NULL,
  "availableQty" INTEGER NOT NULL,
  "reservedQty" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuantityConsignmentLot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuantityConsignmentLot_quantity_check" CHECK ("receivedQty" > 0 AND "availableQty" >= 0 AND "reservedQty" >= 0 AND "availableQty" + "reservedQty" <= "receivedQty"),
  CONSTRAINT "QuantityConsignmentLot_commission_check" CHECK ("commissionBps" >= 0 AND "commissionBps" <= 10000)
);

CREATE TABLE "QuantityConsignmentAllocation" (
  "id" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "orderQuantityAllocationId" TEXT NOT NULL,
  "saleOrderId" TEXT,
  "qty" INTEGER NOT NULL,
  "status" "ConsignmentStatus" NOT NULL DEFAULT 'active',
  "salePrice" INTEGER,
  "commissionAmount" INTEGER,
  "ownerAmount" INTEGER,
  "soldAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "payoutId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuantityConsignmentAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuantityConsignmentAllocation_quantity_check" CHECK ("qty" > 0),
  CONSTRAINT "QuantityConsignmentAllocation_amount_check" CHECK (("salePrice" IS NULL OR "salePrice" >= 0) AND ("commissionAmount" IS NULL OR "commissionAmount" >= 0) AND ("ownerAmount" IS NULL OR "ownerAmount" >= 0))
);

CREATE TABLE "QuantityConsignmentAdjustment" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
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
  CONSTRAINT "QuantityConsignmentAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuantityConsignmentAdjustment_amount_check" CHECK ("amount" >= 0)
);

CREATE UNIQUE INDEX "QuantityConsignmentLot_idempotencyKey_key" ON "QuantityConsignmentLot"("idempotencyKey");
CREATE INDEX "QuantityConsignmentLot_productId_location_createdAt_idx" ON "QuantityConsignmentLot"("productId", "location", "createdAt");
CREATE INDEX "QuantityConsignmentLot_balanceId_availableQty_idx" ON "QuantityConsignmentLot"("balanceId", "availableQty");
CREATE INDEX "QuantityConsignmentLot_ownerName_ownerContact_idx" ON "QuantityConsignmentLot"("ownerName", "ownerContact");
CREATE UNIQUE INDEX "QuantityConsignmentAllocation_orderQuantityAllocationId_lotId_key" ON "QuantityConsignmentAllocation"("orderQuantityAllocationId", "lotId");
CREATE INDEX "QuantityConsignmentAllocation_saleOrderId_status_idx" ON "QuantityConsignmentAllocation"("saleOrderId", "status");
CREATE INDEX "QuantityConsignmentAllocation_payoutId_idx" ON "QuantityConsignmentAllocation"("payoutId");
CREATE INDEX "QuantityConsignmentAllocation_lotId_status_idx" ON "QuantityConsignmentAllocation"("lotId", "status");
CREATE UNIQUE INDEX "QuantityConsignmentAdjustment_returnId_allocationId_key" ON "QuantityConsignmentAdjustment"("returnId", "allocationId");
CREATE INDEX "QuantityConsignmentAdjustment_status_createdAt_idx" ON "QuantityConsignmentAdjustment"("status", "createdAt");
CREATE INDEX "QuantityConsignmentAdjustment_payoutId_idx" ON "QuantityConsignmentAdjustment"("payoutId");
CREATE INDEX "QuantityConsignmentAdjustment_ownerName_ownerContact_idx" ON "QuantityConsignmentAdjustment"("ownerName", "ownerContact");

ALTER TABLE "QuantityConsignmentLot" ADD CONSTRAINT "QuantityConsignmentLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuantityConsignmentLot" ADD CONSTRAINT "QuantityConsignmentLot_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "InventoryBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuantityConsignmentAllocation" ADD CONSTRAINT "QuantityConsignmentAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "QuantityConsignmentLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuantityConsignmentAllocation" ADD CONSTRAINT "QuantityConsignmentAllocation_orderQuantityAllocationId_fkey" FOREIGN KEY ("orderQuantityAllocationId") REFERENCES "OrderQuantityAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuantityConsignmentAllocation" ADD CONSTRAINT "QuantityConsignmentAllocation_saleOrderId_fkey" FOREIGN KEY ("saleOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuantityConsignmentAllocation" ADD CONSTRAINT "QuantityConsignmentAllocation_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "ConsignmentPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
