CREATE TABLE "ServiceWorkOrder" (
  "id" TEXT NOT NULL,
  "warrantyCaseId" TEXT NOT NULL,
  "technicianId" TEXT,
  "diagnosticSummary" TEXT,
  "diagnosticFee" INTEGER NOT NULL DEFAULT 0,
  "estimateAmount" INTEGER,
  "estimatePreparedAt" TIMESTAMP(3),
  "estimateApprovedAt" TIMESTAMP(3),
  "estimateApprovedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceWorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceWorkOrderCommand" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceWorkOrderCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceWorkOrder_warrantyCaseId_key" ON "ServiceWorkOrder"("warrantyCaseId");
CREATE INDEX "ServiceWorkOrder_technicianId_createdAt_idx" ON "ServiceWorkOrder"("technicianId", "createdAt");
CREATE INDEX "ServiceWorkOrder_estimateApprovedAt_createdAt_idx" ON "ServiceWorkOrder"("estimateApprovedAt", "createdAt");
CREATE UNIQUE INDEX "ServiceWorkOrderCommand_idempotencyKey_key" ON "ServiceWorkOrderCommand"("idempotencyKey");
CREATE INDEX "ServiceWorkOrderCommand_workOrderId_createdAt_idx" ON "ServiceWorkOrderCommand"("workOrderId", "createdAt");

ALTER TABLE "ServiceWorkOrder" ADD CONSTRAINT "ServiceWorkOrder_warrantyCaseId_fkey" FOREIGN KEY ("warrantyCaseId") REFERENCES "WarrantyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceWorkOrderCommand" ADD CONSTRAINT "ServiceWorkOrderCommand_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "ServiceWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
