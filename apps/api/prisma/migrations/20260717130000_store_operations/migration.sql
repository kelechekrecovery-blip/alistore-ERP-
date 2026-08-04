-- Store Operations: opening/closing checklists and incident register.
-- The command table makes every repeatable mutation replay-safe without making
-- the operational UI a second source of business truth.
CREATE TYPE "StoreChecklistType" AS ENUM ('opening', 'closing');
CREATE TYPE "StoreChecklistStatus" AS ENUM ('open', 'completed');
CREATE TYPE "StoreIncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "StoreIncidentStatus" AS ENUM ('open', 'investigating', 'resolved');

CREATE TABLE "StoreOperationChecklist" (
    "id" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "type" "StoreChecklistType" NOT NULL,
    "status" "StoreChecklistStatus" NOT NULL DEFAULT 'open',
    "startedBy" TEXT NOT NULL,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreOperationChecklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreOperationChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedBy" TEXT,
    "checkedAt" TIMESTAMP(3),
    "note" TEXT,
    CONSTRAINT "StoreOperationChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreIncident" (
    "id" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "StoreIncidentSeverity" NOT NULL,
    "status" "StoreIncidentStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "createdBy" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreOperationCommand" (
    "idempotencyKey" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreOperationCommand_pkey" PRIMARY KEY ("idempotencyKey")
);

CREATE UNIQUE INDEX "StoreOperationChecklist_idempotencyKey_key" ON "StoreOperationChecklist"("idempotencyKey");
CREATE UNIQUE INDEX "StoreOperationChecklist_point_businessDate_type_key" ON "StoreOperationChecklist"("point", "businessDate", "type");
CREATE INDEX "StoreOperationChecklist_point_businessDate_status_idx" ON "StoreOperationChecklist"("point", "businessDate", "status");
CREATE UNIQUE INDEX "StoreOperationChecklistItem_checklistId_code_key" ON "StoreOperationChecklistItem"("checklistId", "code");
CREATE INDEX "StoreOperationChecklistItem_checklistId_checked_idx" ON "StoreOperationChecklistItem"("checklistId", "checked");
CREATE UNIQUE INDEX "StoreIncident_idempotencyKey_key" ON "StoreIncident"("idempotencyKey");
CREATE INDEX "StoreIncident_point_businessDate_status_idx" ON "StoreIncident"("point", "businessDate", "status");
CREATE INDEX "StoreIncident_severity_status_idx" ON "StoreIncident"("severity", "status");
CREATE INDEX "StoreOperationCommand_resourceType_resourceId_createdAt_idx" ON "StoreOperationCommand"("resourceType", "resourceId", "createdAt");

ALTER TABLE "StoreOperationChecklistItem"
  ADD CONSTRAINT "StoreOperationChecklistItem_checklistId_fkey"
  FOREIGN KEY ("checklistId") REFERENCES "StoreOperationChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
