CREATE TYPE "StockTrackingMode" AS ENUM ('serialized', 'quantity');

ALTER TABLE "Product"
ADD COLUMN "trackingMode" "StockTrackingMode" NOT NULL DEFAULT 'serialized';

CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryBalance_productId_location_key"
ON "InventoryBalance"("productId", "location");

CREATE INDEX "InventoryBalance_location_idx" ON "InventoryBalance"("location");
CREATE INDEX "InventoryBalance_updatedAt_idx" ON "InventoryBalance"("updatedAt");

ALTER TABLE "InventoryBalance"
ADD CONSTRAINT "InventoryBalance_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryBalance"
ADD CONSTRAINT "InventoryBalance_non_negative_check"
CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand");
