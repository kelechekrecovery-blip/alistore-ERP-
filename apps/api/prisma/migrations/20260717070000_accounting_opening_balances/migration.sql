CREATE TABLE "AccountingOpeningBalance" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "accountingEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingOpeningBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingOpeningBalanceLine" (
    "id" TEXT NOT NULL,
    "openingBalanceId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,
    CONSTRAINT "AccountingOpeningBalanceLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingOpeningBalance_period_key" ON "AccountingOpeningBalance"("period");
CREATE UNIQUE INDEX "AccountingOpeningBalance_documentNumber_key" ON "AccountingOpeningBalance"("documentNumber");
CREATE UNIQUE INDEX "AccountingOpeningBalance_idempotencyKey_key" ON "AccountingOpeningBalance"("idempotencyKey");
CREATE UNIQUE INDEX "AccountingOpeningBalance_accountingEntryId_key" ON "AccountingOpeningBalance"("accountingEntryId");
CREATE INDEX "AccountingOpeningBalance_createdAt_idx" ON "AccountingOpeningBalance"("createdAt");
CREATE UNIQUE INDEX "AccountingOpeningBalanceLine_openingBalanceId_accountCode_key" ON "AccountingOpeningBalanceLine"("openingBalanceId", "accountCode");
CREATE INDEX "AccountingOpeningBalanceLine_accountCode_openingBalanceId_idx" ON "AccountingOpeningBalanceLine"("accountCode", "openingBalanceId");

ALTER TABLE "AccountingOpeningBalance"
  ADD CONSTRAINT "AccountingOpeningBalance_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingOpeningBalanceLine"
  ADD CONSTRAINT "AccountingOpeningBalanceLine_openingBalanceId_fkey"
  FOREIGN KEY ("openingBalanceId") REFERENCES "AccountingOpeningBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingOpeningBalanceLine"
  ADD CONSTRAINT "AccountingOpeningBalanceLine_accountCode_fkey"
  FOREIGN KEY ("accountCode") REFERENCES "AccountingAccount"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
