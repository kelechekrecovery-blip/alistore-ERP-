CREATE TABLE "StorePoint" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "inventoryLocation" TEXT NOT NULL,
  "hours" TEXT NOT NULL,
  "pickupInstructions" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "createdBy" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorePoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorePointCommand" (
  "idempotencyKey" TEXT NOT NULL,
  "storePointId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorePointCommand_pkey" PRIMARY KEY ("idempotencyKey")
);

CREATE UNIQUE INDEX "StorePoint_code_key" ON "StorePoint"("code");
CREATE UNIQUE INDEX "StorePoint_inventoryLocation_key" ON "StorePoint"("inventoryLocation");
CREATE UNIQUE INDEX "StorePoint_idempotencyKey_key" ON "StorePoint"("idempotencyKey");
CREATE INDEX "StorePoint_active_sortOrder_idx" ON "StorePoint"("active", "sortOrder");
CREATE INDEX "StorePointCommand_storePointId_createdAt_idx" ON "StorePointCommand"("storePointId", "createdAt");

INSERT INTO "StorePoint" (
  "id", "code", "name", "address", "inventoryLocation", "hours",
  "pickupInstructions", "active", "sortOrder", "createdBy", "idempotencyKey", "updatedAt"
) VALUES (
  'alistore-bishkek-1', 'center', 'AliStore Центр', 'Бишкек, ул. Киевская 95',
  'BISHKEK-1', 'Ежедневно 10:00–21:00', 'Назовите код выдачи сотруднику',
  true, 10, 'migration', 'seed:store-point:bishkek-1', CURRENT_TIMESTAMP
);

ALTER TABLE "Order" ADD COLUMN "storePointId" TEXT;
ALTER TABLE "Order" ADD COLUMN "storePointCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "storePointName" TEXT;
ALTER TABLE "Order" ADD COLUMN "storePointAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN "pickupAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN "fulfillmentLocation" TEXT;

UPDATE "Order"
SET "storePointId" = 'alistore-bishkek-1',
    "storePointCode" = 'center',
    "storePointName" = 'AliStore Центр',
    "storePointAddress" = 'Бишкек, ул. Киевская 95',
    "pickupPoint" = 'AliStore Центр',
    "pickupAddress" = 'Бишкек, ул. Киевская 95',
    "fulfillmentLocation" = 'BISHKEK-1'
WHERE "pickupPoint" IN ('BISHKEK-1', 'alistore-center', 'AliStore Центр');

ALTER TABLE "OrderQuantityAllocation" ADD COLUMN "location" TEXT;
UPDATE "OrderQuantityAllocation" AS allocation
SET "location" = balance."location"
FROM "InventoryBalance" AS balance
WHERE allocation."balanceId" = balance."id";
ALTER TABLE "OrderQuantityAllocation" ALTER COLUMN "location" SET NOT NULL;

ALTER TABLE "OrderBundleAllocation" ADD COLUMN "location" TEXT;
UPDATE "OrderBundleAllocation" AS allocation
SET "location" = unit."location"
FROM "DeviceUnit" AS unit
WHERE allocation."imei" = unit."imei";
ALTER TABLE "OrderBundleAllocation" ALTER COLUMN "location" SET NOT NULL;

CREATE INDEX "Order_storePointId_status_idx" ON "Order"("storePointId", "status");

ALTER TABLE "StorePointCommand"
  ADD CONSTRAINT "StorePointCommand_storePointId_fkey"
  FOREIGN KEY ("storePointId") REFERENCES "StorePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_storePointId_fkey"
  FOREIGN KEY ("storePointId") REFERENCES "StorePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
