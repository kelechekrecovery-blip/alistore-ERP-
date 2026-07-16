CREATE TYPE "SupplierStatementStatus" AS ENUM ('imported', 'reconciled', 'disputed');
CREATE TYPE "SupplierStatementLineStatus" AS ENUM ('unmatched', 'matched', 'disputed');

CREATE TABLE "SupplierStatement" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "statementNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingBalance" INTEGER NOT NULL,
    "closingBalance" INTEGER NOT NULL,
    "status" "SupplierStatementStatus" NOT NULL DEFAULT 'imported',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierStatement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierStatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "status" "SupplierStatementLineStatus" NOT NULL DEFAULT 'unmatched',
    "reconciliationKey" TEXT,
    "matchedEntryId" TEXT,
    "matchedBy" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierStatementLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierStatement_statementNumber_key" ON "SupplierStatement"("statementNumber");
CREATE UNIQUE INDEX "SupplierStatement_idempotencyKey_key" ON "SupplierStatement"("idempotencyKey");
CREATE INDEX "SupplierStatement_supplierId_periodStart_periodEnd_idx" ON "SupplierStatement"("supplierId", "periodStart", "periodEnd");
CREATE INDEX "SupplierStatement_status_createdAt_idx" ON "SupplierStatement"("status", "createdAt");

CREATE UNIQUE INDEX "SupplierStatementLine_reconciliationKey_key" ON "SupplierStatementLine"("reconciliationKey");
CREATE UNIQUE INDEX "SupplierStatementLine_matchedEntryId_key" ON "SupplierStatementLine"("matchedEntryId");
CREATE UNIQUE INDEX "SupplierStatementLine_statementId_externalId_key" ON "SupplierStatementLine"("statementId", "externalId");
CREATE INDEX "SupplierStatementLine_statementId_status_idx" ON "SupplierStatementLine"("statementId", "status");
CREATE INDEX "SupplierStatementLine_occurredAt_amount_idx" ON "SupplierStatementLine"("occurredAt", "amount");

ALTER TABLE "SupplierStatement"
  ADD CONSTRAINT "SupplierStatement_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierStatementLine"
  ADD CONSTRAINT "SupplierStatementLine_statementId_fkey"
  FOREIGN KEY ("statementId") REFERENCES "SupplierStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierStatementLine"
  ADD CONSTRAINT "SupplierStatementLine_matchedEntryId_fkey"
  FOREIGN KEY ("matchedEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
