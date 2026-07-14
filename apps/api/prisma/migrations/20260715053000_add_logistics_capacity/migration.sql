CREATE TABLE "DeliveryZone" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fee" INTEGER NOT NULL,
  "etaMinMinutes" INTEGER NOT NULL,
  "etaMaxMinutes" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliverySlot" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "capacity" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliverySlot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order" ADD COLUMN "deliveryZoneId" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliverySlotId" TEXT;

CREATE UNIQUE INDEX "DeliveryZone_code_key" ON "DeliveryZone"("code");
CREATE UNIQUE INDEX "DeliveryZone_idempotencyKey_key" ON "DeliveryZone"("idempotencyKey");
CREATE UNIQUE INDEX "DeliverySlot_idempotencyKey_key" ON "DeliverySlot"("idempotencyKey");
CREATE UNIQUE INDEX "DeliverySlot_zoneId_startsAt_endsAt_key" ON "DeliverySlot"("zoneId", "startsAt", "endsAt");
CREATE INDEX "DeliverySlot_startsAt_active_idx" ON "DeliverySlot"("startsAt", "active");
CREATE INDEX "Order_deliveryZoneId_status_idx" ON "Order"("deliveryZoneId", "status");
CREATE INDEX "Order_deliverySlotId_status_idx" ON "Order"("deliverySlotId", "status");

ALTER TABLE "DeliverySlot" ADD CONSTRAINT "DeliverySlot_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliverySlotId_fkey" FOREIGN KEY ("deliverySlotId") REFERENCES "DeliverySlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
