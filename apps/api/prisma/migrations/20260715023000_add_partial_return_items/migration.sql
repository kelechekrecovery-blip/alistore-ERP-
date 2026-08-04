ALTER TABLE "OrderQuantityAllocation" ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuantityConsignmentAllocation" ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuantityConsignmentAllocation" ADD COLUMN "returnedSaleAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuantityConsignmentAllocation" ADD COLUMN "returnedCommissionAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuantityConsignmentAllocation" ADD COLUMN "returnedOwnerAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Return" ADD COLUMN "refundAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Return" ADD COLUMN "isFullOrder" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Return" r
SET "refundAmount" = o."total"
FROM "Order" o
WHERE o."id" = r."orderId" AND r."refundAmount" = 0;

CREATE TABLE "ReturnItem" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "refundAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReturnItem_qty_check" CHECK ("qty" > 0),
  CONSTRAINT "ReturnItem_refund_check" CHECK ("refundAmount" >= 0)
);

CREATE UNIQUE INDEX "ReturnItem_returnId_orderItemId_key" ON "ReturnItem"("returnId", "orderItemId");
CREATE INDEX "ReturnItem_orderItemId_idx" ON "ReturnItem"("orderItemId");

ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderQuantityAllocation" ADD CONSTRAINT "OrderQuantityAllocation_returnedQty_check" CHECK ("returnedQty" >= 0 AND "returnedQty" <= "qty");
ALTER TABLE "QuantityConsignmentAllocation" ADD CONSTRAINT "QuantityConsignmentAllocation_returnedQty_check" CHECK ("returnedQty" >= 0 AND "returnedQty" <= "qty");
ALTER TABLE "QuantityConsignmentAllocation" ADD CONSTRAINT "QuantityConsignmentAllocation_returnedAmounts_check" CHECK (
  "returnedSaleAmount" >= 0 AND "returnedCommissionAmount" >= 0 AND "returnedOwnerAmount" >= 0
  AND ("salePrice" IS NULL OR "returnedSaleAmount" <= "salePrice")
  AND ("commissionAmount" IS NULL OR "returnedCommissionAmount" <= "commissionAmount")
  AND ("ownerAmount" IS NULL OR "returnedOwnerAmount" <= "ownerAmount")
);
