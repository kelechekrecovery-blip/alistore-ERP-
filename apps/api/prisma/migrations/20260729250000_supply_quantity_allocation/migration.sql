CREATE TABLE "SupplyQuantityAllocation" (
    "id" TEXT NOT NULL,
    "orderLineSupplyId" TEXT NOT NULL,
    "purchaseReceiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consumedAt" TIMESTAMP(3),
    "valuationIssueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyQuantityAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupplyQuantityAllocation_qty_check" CHECK ("qty" > 0),
    CONSTRAINT "SupplyQuantityAllocation_unit_cost_check" CHECK ("unitCost" >= 0),
    CONSTRAINT "SupplyQuantityAllocation_consumption_check"
      CHECK (("active" = true AND "consumedAt" IS NULL AND "valuationIssueId" IS NULL)
          OR ("active" = false AND "consumedAt" IS NOT NULL AND "valuationIssueId" IS NOT NULL))
);

CREATE UNIQUE INDEX "SupplyQuantityAllocation_valuationIssueId_key"
  ON "SupplyQuantityAllocation"("valuationIssueId");
CREATE UNIQUE INDEX "SupplyQuantityAllocation_purchaseReceiptId_orderLineSupplyId_key"
  ON "SupplyQuantityAllocation"("purchaseReceiptId", "orderLineSupplyId");
CREATE INDEX "SupplyQuantityAllocation_orderLineSupplyId_active_idx"
  ON "SupplyQuantityAllocation"("orderLineSupplyId", "active");
CREATE INDEX "SupplyQuantityAllocation_productId_active_idx"
  ON "SupplyQuantityAllocation"("productId", "active");

ALTER TABLE "SupplyQuantityAllocation"
  ADD CONSTRAINT "SupplyQuantityAllocation_orderLineSupplyId_fkey"
  FOREIGN KEY ("orderLineSupplyId") REFERENCES "OrderLineSupply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyQuantityAllocation"
  ADD CONSTRAINT "SupplyQuantityAllocation_purchaseReceiptId_fkey"
  FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyQuantityAllocation"
  ADD CONSTRAINT "SupplyQuantityAllocation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyQuantityAllocation"
  ADD CONSTRAINT "SupplyQuantityAllocation_valuationIssueId_fkey"
  FOREIGN KEY ("valuationIssueId") REFERENCES "InventoryValuationIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
