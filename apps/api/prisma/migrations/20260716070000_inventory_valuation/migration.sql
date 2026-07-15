ALTER TABLE "InventoryBalance" ADD COLUMN "inventoryValue" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeviceUnit" ADD COLUMN "acquisitionCost" INTEGER;
ALTER TABLE "InventoryMovement" ADD COLUMN "unitCost" INTEGER;
ALTER TABLE "InventoryMovement" ADD COLUMN "totalValue" INTEGER;

CREATE TABLE "InventoryValuationLayer" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "balanceId" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "quantityReceived" INTEGER NOT NULL,
  "quantityRemaining" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryValuationLayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryValuationIssue" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "layerId" TEXT,
  "imei" TEXT,
  "orderId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "totalCost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryValuationIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryValuationLayer_sourceType_sourceRef_key" ON "InventoryValuationLayer"("sourceType", "sourceRef");
CREATE INDEX "InventoryValuationLayer_productId_location_createdAt_idx" ON "InventoryValuationLayer"("productId", "location", "createdAt");
CREATE INDEX "InventoryValuationLayer_balanceId_quantityRemaining_createdAt_idx" ON "InventoryValuationLayer"("balanceId", "quantityRemaining", "createdAt");
CREATE UNIQUE INDEX "InventoryValuationIssue_sourceType_sourceRef_key" ON "InventoryValuationIssue"("sourceType", "sourceRef");
CREATE INDEX "InventoryValuationIssue_productId_createdAt_idx" ON "InventoryValuationIssue"("productId", "createdAt");
CREATE INDEX "InventoryValuationIssue_orderId_idx" ON "InventoryValuationIssue"("orderId");
CREATE INDEX "InventoryValuationIssue_imei_idx" ON "InventoryValuationIssue"("imei");

ALTER TABLE "InventoryValuationLayer" ADD CONSTRAINT "InventoryValuationLayer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationLayer" ADD CONSTRAINT "InventoryValuationLayer_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "InventoryBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationIssue" ADD CONSTRAINT "InventoryValuationIssue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationIssue" ADD CONSTRAINT "InventoryValuationIssue_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "InventoryValuationLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationIssue" ADD CONSTRAINT "InventoryValuationIssue_imei_fkey" FOREIGN KEY ("imei") REFERENCES "DeviceUnit"("imei") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "DeviceUnit" u SET "acquisitionCost" = p."cost"
FROM "Product" p WHERE p."id" = u."productId" AND u."acquisitionCost" IS NULL;
UPDATE "InventoryBalance" b SET "inventoryValue" = b."onHand" * p."cost"
FROM "Product" p WHERE p."id" = b."productId" AND b."inventoryValue" = 0 AND b."onHand" > 0;
