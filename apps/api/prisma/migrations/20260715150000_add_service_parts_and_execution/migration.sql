ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'service' AFTER 'warehouse';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'technician' AFTER 'service';
ALTER TYPE "WarrantyStatus" ADD VALUE IF NOT EXISTS 'repairing' AFTER 'approved';

CREATE TYPE "ServicePartStatus" AS ENUM ('reserved', 'consumed', 'released');

ALTER TABLE "ServiceWorkOrder"
  ADD COLUMN "repairStartedAt" TIMESTAMP(3),
  ADD COLUMN "repairCompletedAt" TIMESTAMP(3),
  ADD COLUMN "repairClosedAt" TIMESTAMP(3),
  ADD COLUMN "repairWarrantyUntil" TIMESTAMP(3),
  ADD COLUMN "completionSummary" TEXT,
  ADD COLUMN "replacementImei" TEXT;

UPDATE "ServiceWorkOrder" AS swo
SET
  "repairStartedAt" = COALESCE(swo."estimateApprovedAt", swo."createdAt"),
  "repairCompletedAt" = COALESCE(swo."updatedAt", swo."createdAt")
FROM "WarrantyCase" AS wc
WHERE wc."id" = swo."warrantyCaseId"
  AND wc."status" IN ('repaired', 'replaced');

ALTER TABLE "ServiceWorkOrder"
  ADD CONSTRAINT "ServiceWorkOrder_repair_chronology_check" CHECK (
    ("repairCompletedAt" IS NULL OR ("repairStartedAt" IS NOT NULL AND "repairCompletedAt" >= "repairStartedAt")) AND
    ("repairClosedAt" IS NULL OR ("repairCompletedAt" IS NOT NULL AND "repairClosedAt" >= "repairCompletedAt")) AND
    ("repairWarrantyUntil" IS NULL OR ("repairClosedAt" IS NOT NULL AND "repairWarrantyUntil" >= "repairClosedAt"))
  );

ALTER TABLE "WarrantyCase" ADD COLUMN "slaEscalatedAt" TIMESTAMP(3);

CREATE TABLE "ServicePart" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "balanceId" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "status" "ServicePartStatus" NOT NULL DEFAULT 'reserved',
  "reservedBy" TEXT NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedBy" TEXT,
  "consumedAt" TIMESTAMP(3),
  "releasedBy" TEXT,
  "releasedAt" TIMESTAMP(3),
  "movementId" TEXT,

  CONSTRAINT "ServicePart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServicePart_qty_check" CHECK ("qty" > 0),
  CONSTRAINT "ServicePart_state_check" CHECK (
    ("status" = 'reserved' AND "consumedAt" IS NULL AND "releasedAt" IS NULL) OR
    ("status" = 'consumed' AND "consumedBy" IS NOT NULL AND "consumedAt" IS NOT NULL AND "movementId" IS NOT NULL AND "releasedAt" IS NULL) OR
    ("status" = 'released' AND "releasedBy" IS NOT NULL AND "releasedAt" IS NOT NULL AND "consumedAt" IS NULL AND "movementId" IS NULL)
  )
);

CREATE INDEX "ServicePart_workOrderId_status_idx" ON "ServicePart"("workOrderId", "status");
CREATE INDEX "ServicePart_balanceId_status_idx" ON "ServicePart"("balanceId", "status");
CREATE INDEX "ServicePart_productId_status_idx" ON "ServicePart"("productId", "status");
CREATE UNIQUE INDEX "ServicePart_movementId_key" ON "ServicePart"("movementId");
CREATE UNIQUE INDEX "ServiceWorkOrder_replacementImei_key" ON "ServiceWorkOrder"("replacementImei");
CREATE INDEX "WarrantyCase_status_sla_idx" ON "WarrantyCase"("status", "sla");

ALTER TABLE "ServicePart"
  ADD CONSTRAINT "ServicePart_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "ServiceWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServicePart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServicePart_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "InventoryBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServicePart_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceWorkOrder"
  ADD CONSTRAINT "ServiceWorkOrder_replacementImei_fkey" FOREIGN KEY ("replacementImei") REFERENCES "DeviceUnit"("imei") ON DELETE RESTRICT ON UPDATE CASCADE;
