CREATE TYPE "FinanceSettlementStatus" AS ENUM ('balanced', 'disputed', 'closed');
CREATE TYPE "FinanceSettlementLineStatus" AS ENUM ('matched', 'disputed', 'reconciled');
CREATE TYPE "FinanceSettlementSourceType" AS ENUM ('provider_payment', 'pos_shift', 'courier_cod', 'refund');

ALTER TABLE "CourierRun" ADD COLUMN "handedOverAt" TIMESTAMP(3);
UPDATE "CourierRun" SET "handedOverAt" = "createdAt" WHERE "handedOver" = true;

CREATE TABLE "FinanceSettlementRun" (
  "id" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "point" TEXT NOT NULL DEFAULT '',
  "status" "FinanceSettlementStatus" NOT NULL DEFAULT 'balanced',
  "expectedTotal" INTEGER NOT NULL,
  "actualTotal" INTEGER NOT NULL,
  "adjustmentTotal" INTEGER NOT NULL DEFAULT 0,
  "variance" INTEGER NOT NULL,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "closedBy" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceSettlementRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceSettlementLine" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "sourceType" "FinanceSettlementSourceType" NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "expectedAmount" INTEGER NOT NULL,
  "actualAmount" INTEGER NOT NULL,
  "adjustmentAmount" INTEGER NOT NULL DEFAULT 0,
  "variance" INTEGER NOT NULL,
  "status" "FinanceSettlementLineStatus" NOT NULL DEFAULT 'matched',
  "reason" TEXT,
  "resolutionReason" TEXT,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceSettlementLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceSettlementCommand" (
  "idempotencyKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "runId" TEXT,
  "input" JSONB NOT NULL,
  "response" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceSettlementCommand_pkey" PRIMARY KEY ("idempotencyKey")
);

CREATE UNIQUE INDEX "FinanceSettlementLine_sourceType_sourceRef_key" ON "FinanceSettlementLine"("sourceType", "sourceRef");
CREATE INDEX "FinanceSettlementRun_status_createdAt_idx" ON "FinanceSettlementRun"("status", "createdAt");
CREATE INDEX "FinanceSettlementRun_periodStart_periodEnd_point_idx" ON "FinanceSettlementRun"("periodStart", "periodEnd", "point");
CREATE INDEX "FinanceSettlementLine_runId_status_idx" ON "FinanceSettlementLine"("runId", "status");
CREATE INDEX "FinanceSettlementCommand_runId_createdAt_idx" ON "FinanceSettlementCommand"("runId", "createdAt");
ALTER TABLE "FinanceSettlementLine" ADD CONSTRAINT "FinanceSettlementLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FinanceSettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
