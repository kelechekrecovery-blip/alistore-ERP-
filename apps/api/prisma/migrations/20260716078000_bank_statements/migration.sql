CREATE TYPE "BankStatementStatus" AS ENUM ('imported', 'reconciled', 'disputed');
CREATE TYPE "BankStatementLineStatus" AS ENUM ('unmatched', 'matched', 'disputed');

CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "statementNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingBalance" INTEGER NOT NULL,
    "closingBalance" INTEGER NOT NULL,
    "status" "BankStatementStatus" NOT NULL DEFAULT 'imported',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "status" "BankStatementLineStatus" NOT NULL DEFAULT 'unmatched',
    "reconciliationKey" TEXT,
    "matchedEntryId" TEXT,
    "matchedBy" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankStatement_statementNumber_key" ON "BankStatement"("statementNumber");
CREATE UNIQUE INDEX "BankStatement_idempotencyKey_key" ON "BankStatement"("idempotencyKey");
CREATE INDEX "BankStatement_accountCode_periodStart_periodEnd_idx" ON "BankStatement"("accountCode", "periodStart", "periodEnd");
CREATE INDEX "BankStatement_status_createdAt_idx" ON "BankStatement"("status", "createdAt");
CREATE UNIQUE INDEX "BankStatementLine_matchedEntryId_key" ON "BankStatementLine"("matchedEntryId");
CREATE UNIQUE INDEX "BankStatementLine_reconciliationKey_key" ON "BankStatementLine"("reconciliationKey");
CREATE UNIQUE INDEX "BankStatementLine_statementId_externalId_key" ON "BankStatementLine"("statementId", "externalId");
CREATE INDEX "BankStatementLine_statementId_status_idx" ON "BankStatementLine"("statementId", "status");
CREATE INDEX "BankStatementLine_occurredAt_amount_idx" ON "BankStatementLine"("occurredAt", "amount");

ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_accountCode_fkey" FOREIGN KEY ("accountCode") REFERENCES "AccountingAccount"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_matchedEntryId_fkey" FOREIGN KEY ("matchedEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
