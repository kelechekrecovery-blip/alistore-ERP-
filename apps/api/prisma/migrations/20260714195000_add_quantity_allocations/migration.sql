CREATE TABLE "OrderQuantityAllocation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderQuantityAllocation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Reservation" ADD COLUMN "quantityAllocationId" TEXT;

CREATE INDEX "OrderQuantityAllocation_orderId_active_idx"
ON "OrderQuantityAllocation"("orderId", "active");
CREATE INDEX "OrderQuantityAllocation_productId_idx"
ON "OrderQuantityAllocation"("productId");
CREATE INDEX "OrderQuantityAllocation_balanceId_idx"
ON "OrderQuantityAllocation"("balanceId");
CREATE UNIQUE INDEX "Reservation_quantityAllocationId_key"
ON "Reservation"("quantityAllocationId");

ALTER TABLE "OrderQuantityAllocation"
ADD CONSTRAINT "OrderQuantityAllocation_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderQuantityAllocation"
ADD CONSTRAINT "OrderQuantityAllocation_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderQuantityAllocation"
ADD CONSTRAINT "OrderQuantityAllocation_balanceId_fkey"
FOREIGN KEY ("balanceId") REFERENCES "InventoryBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation"
ADD CONSTRAINT "Reservation_quantityAllocationId_fkey"
FOREIGN KEY ("quantityAllocationId") REFERENCES "OrderQuantityAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderQuantityAllocation"
ADD CONSTRAINT "OrderQuantityAllocation_qty_check" CHECK ("qty" > 0);
