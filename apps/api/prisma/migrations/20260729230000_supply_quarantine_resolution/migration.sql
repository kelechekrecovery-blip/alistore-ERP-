-- Refused customer-specific supply stays unavailable until an owner/admin
-- explicitly returns it to the supplier or converts it into AliStore stock.
ALTER TYPE "UnitStatus" ADD VALUE IF NOT EXISTS 'quarantined';
ALTER TYPE "UnitStatus" ADD VALUE IF NOT EXISTS 'returned_supplier';

CREATE TYPE "SupplyQuarantineStatus" AS ENUM ('pending', 'resolved');
CREATE TYPE "SupplyQuarantineDisposition" AS ENUM ('return_to_supplier', 'convert_to_own_stock');

CREATE TABLE "SupplyQuarantineResolution" (
  "id" TEXT NOT NULL,
  "orderLineSupplyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "storePointId" TEXT NOT NULL,
  "inventoryLocationSnapshot" TEXT NOT NULL,
  "trackingModeSnapshot" "StockTrackingMode" NOT NULL,
  "quarantinedQty" INTEGER NOT NULL,
  "unitCostSnapshot" INTEGER NOT NULL,
  "imeis" JSONB,
  "status" "SupplyQuarantineStatus" NOT NULL DEFAULT 'pending',
  "disposition" "SupplyQuarantineDisposition",
  "proposalReason" TEXT NOT NULL,
  "proposalEvidence" JSONB NOT NULL,
  "proposedBy" TEXT NOT NULL,
  "proposalIdempotencyKey" TEXT NOT NULL,
  "proposalHash" TEXT NOT NULL,
  "resolutionReason" TEXT,
  "resolutionEvidence" JSONB,
  "resolvedBy" TEXT,
  "resolutionIdempotencyKey" TEXT,
  "resolutionHash" TEXT,
  "inventoryMovementId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "SupplyQuarantineResolution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplyQuarantineResolution_qty_check" CHECK ("quarantinedQty" > 0),
  CONSTRAINT "SupplyQuarantineResolution_cost_check" CHECK ("unitCostSnapshot" >= 0),
  CONSTRAINT "SupplyQuarantineResolution_location_check" CHECK (length(btrim("inventoryLocationSnapshot")) > 0),
  CONSTRAINT "SupplyQuarantineResolution_proposal_reason_check" CHECK (length(btrim("proposalReason")) >= 3),
  CONSTRAINT "SupplyQuarantineResolution_proposal_evidence_check"
    CHECK (jsonb_typeof("proposalEvidence") = 'object' AND "proposalEvidence" <> '{}'::jsonb),
  CONSTRAINT "SupplyQuarantineResolution_imei_shape_check"
    CHECK ("imeis" IS NULL OR jsonb_typeof("imeis") = 'array'),
  CONSTRAINT "SupplyQuarantineResolution_resolution_check" CHECK (
    (
      "status" = 'pending'
      AND "disposition" IS NULL
      AND "resolutionReason" IS NULL
      AND "resolutionEvidence" IS NULL
      AND "resolvedBy" IS NULL
      AND "resolutionIdempotencyKey" IS NULL
      AND "resolutionHash" IS NULL
      AND "inventoryMovementId" IS NULL
      AND "resolvedAt" IS NULL
    )
    OR
    (
      "status" = 'resolved'
      AND "disposition" IS NOT NULL
      AND length(btrim("resolutionReason")) >= 3
      AND jsonb_typeof("resolutionEvidence") = 'object'
      AND "resolutionEvidence" <> '{}'::jsonb
      AND "resolvedBy" IS NOT NULL
      AND "resolutionIdempotencyKey" IS NOT NULL
      AND "resolutionHash" IS NOT NULL
      AND "resolvedAt" IS NOT NULL
      AND (
        ("disposition" = 'convert_to_own_stock' AND "inventoryMovementId" IS NOT NULL)
        OR
        ("disposition" = 'return_to_supplier' AND "inventoryMovementId" IS NULL)
      )
    )
  )
);

ALTER TABLE "DeviceUnit"
  ADD COLUMN "supplyQuarantineResolutionId" TEXT;

CREATE UNIQUE INDEX "SupplyQuarantineResolution_orderLineSupplyId_key"
  ON "SupplyQuarantineResolution"("orderLineSupplyId");
CREATE UNIQUE INDEX "SupplyQuarantineResolution_proposalIdempotencyKey_key"
  ON "SupplyQuarantineResolution"("proposalIdempotencyKey");
CREATE UNIQUE INDEX "SupplyQuarantineResolution_resolutionIdempotencyKey_key"
  ON "SupplyQuarantineResolution"("resolutionIdempotencyKey");
CREATE UNIQUE INDEX "SupplyQuarantineResolution_inventoryMovementId_key"
  ON "SupplyQuarantineResolution"("inventoryMovementId");
CREATE INDEX "SupplyQuarantineResolution_status_createdAt_idx"
  ON "SupplyQuarantineResolution"("status", "createdAt");
CREATE INDEX "SupplyQuarantineResolution_storePointId_status_idx"
  ON "SupplyQuarantineResolution"("storePointId", "status");
CREATE INDEX "SupplyQuarantineResolution_productId_status_idx"
  ON "SupplyQuarantineResolution"("productId", "status");
CREATE INDEX "DeviceUnit_supplyQuarantineResolutionId_idx"
  ON "DeviceUnit"("supplyQuarantineResolutionId");

ALTER TABLE "SupplyQuarantineResolution"
  ADD CONSTRAINT "SupplyQuarantineResolution_orderLineSupplyId_fkey"
  FOREIGN KEY ("orderLineSupplyId") REFERENCES "OrderLineSupply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyQuarantineResolution"
  ADD CONSTRAINT "SupplyQuarantineResolution_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyQuarantineResolution"
  ADD CONSTRAINT "SupplyQuarantineResolution_storePointId_fkey"
  FOREIGN KEY ("storePointId") REFERENCES "StorePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyQuarantineResolution"
  ADD CONSTRAINT "SupplyQuarantineResolution_inventoryMovementId_fkey"
  FOREIGN KEY ("inventoryMovementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeviceUnit"
  ADD CONSTRAINT "DeviceUnit_supplyQuarantineResolutionId_fkey"
  FOREIGN KEY ("supplyQuarantineResolutionId") REFERENCES "SupplyQuarantineResolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
