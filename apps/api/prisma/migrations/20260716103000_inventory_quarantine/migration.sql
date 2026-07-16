CREATE TYPE "InventoryQuarantineStatus" AS ENUM ('pending_diagnosis', 'diagnosed', 'disposed');
CREATE TYPE "InventoryQuarantineDiagnosis" AS ENUM ('resellable', 'repair', 'write_off');
CREATE TYPE "InventoryQuarantineDisposition" AS ENUM ('restock', 'repair', 'write_off');

CREATE TABLE "InventoryQuarantineCase" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "status" "InventoryQuarantineStatus" NOT NULL DEFAULT 'pending_diagnosis',
  "diagnosis" "InventoryQuarantineDiagnosis",
  "disposition" "InventoryQuarantineDisposition",
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "diagnosedBy" TEXT,
  "disposedBy" TEXT,
  "diagnosedAt" TIMESTAMP(3),
  "disposedAt" TIMESTAMP(3),
  "dispositionApprovalId" TEXT,
  "repairWorkOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryQuarantineCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryQuarantineCase_sourceType_returnId_unitId_key"
  ON "InventoryQuarantineCase"("sourceType", "returnId", "unitId");
CREATE UNIQUE INDEX "InventoryQuarantineCase_active_unit_key"
  ON "InventoryQuarantineCase"("unitId") WHERE "status" <> 'disposed';
CREATE UNIQUE INDEX "InventoryQuarantineCase_dispositionApprovalId_key"
  ON "InventoryQuarantineCase"("dispositionApprovalId");
CREATE UNIQUE INDEX "InventoryQuarantineCase_repairWorkOrderId_key"
  ON "InventoryQuarantineCase"("repairWorkOrderId");
CREATE INDEX "InventoryQuarantineCase_status_createdAt_idx"
  ON "InventoryQuarantineCase"("status", "createdAt" DESC);
CREATE INDEX "InventoryQuarantineCase_unitId_status_idx"
  ON "InventoryQuarantineCase"("unitId", "status");
CREATE INDEX "InventoryQuarantineCase_returnId_idx"
  ON "InventoryQuarantineCase"("returnId");

ALTER TABLE "InventoryQuarantineCase"
  ADD CONSTRAINT "InventoryQuarantineCase_state_check" CHECK (
    ("status" = 'pending_diagnosis' AND "diagnosis" IS NULL AND "disposition" IS NULL AND "diagnosedBy" IS NULL AND "disposedBy" IS NULL AND "diagnosedAt" IS NULL AND "disposedAt" IS NULL)
    OR ("status" = 'diagnosed' AND "diagnosis" IS NOT NULL AND "disposition" IS NULL AND "diagnosedBy" IS NOT NULL AND "disposedBy" IS NULL AND "diagnosedAt" IS NOT NULL AND "disposedAt" IS NULL)
    OR ("status" = 'disposed' AND "diagnosis" IS NOT NULL AND "disposition" IS NOT NULL AND "diagnosedBy" IS NOT NULL AND "disposedBy" IS NOT NULL AND "diagnosedAt" IS NOT NULL AND "disposedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "InventoryQuarantineCase_mapping_check" CHECK (
    "disposition" IS NULL OR
    ("diagnosis" = 'resellable' AND "disposition" = 'restock') OR
    ("diagnosis" = 'repair' AND "disposition" = 'repair') OR
    ("diagnosis" = 'write_off' AND "disposition" = 'write_off')
  ),
  ADD CONSTRAINT "InventoryQuarantineCase_four_eyes_check" CHECK ("disposedBy" IS NULL OR "diagnosedBy" <> "disposedBy"),
  ADD CONSTRAINT "InventoryQuarantineCase_source_check" CHECK ("sourceType" IN ('return', 'exchange')),
  ADD CONSTRAINT "InventoryQuarantineCase_cost_check" CHECK ("unitCost" >= 0),
  ADD CONSTRAINT "InventoryQuarantineCase_repair_link_check" CHECK (
    ("disposition" = 'repair' AND "repairWorkOrderId" IS NOT NULL) OR
    ("disposition" IS DISTINCT FROM 'repair' AND "repairWorkOrderId" IS NULL)
  );

ALTER TABLE "InventoryQuarantineCase"
  ADD CONSTRAINT "InventoryQuarantineCase_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "DeviceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryQuarantineCase"
  ADD CONSTRAINT "InventoryQuarantineCase_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryQuarantineCase"
  ADD CONSTRAINT "InventoryQuarantineCase_dispositionApprovalId_fkey"
  FOREIGN KEY ("dispositionApprovalId") REFERENCES "Approval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryQuarantineCase"
  ADD CONSTRAINT "InventoryQuarantineCase_repairWorkOrderId_fkey"
  FOREIGN KEY ("repairWorkOrderId") REFERENCES "ServiceWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
