CREATE TYPE "AccountableAdvanceStatus" AS ENUM ('open', 'partially_settled', 'settled');

INSERT INTO "AccountingAccount" ("code", "name", "type", "system", "active") VALUES
  ('1250', 'Расчёты с подотчётными лицами', 'asset', true, true)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "AccountableAdvance" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "settledAmount" INTEGER NOT NULL DEFAULT 0,
    "returnedAmount" INTEGER NOT NULL DEFAULT 0,
    "reimbursedAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "AccountableAdvanceStatus" NOT NULL DEFAULT 'open',
    "fundingAccountCode" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "accountingEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountableAdvance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountableAdvanceSettlement" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "expenseAccountCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "settledBy" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountingEntryId" TEXT NOT NULL,
    CONSTRAINT "AccountableAdvanceSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountableAdvanceReturn" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "fundingAccountCode" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "returnedBy" TEXT NOT NULL,
    "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountingEntryId" TEXT NOT NULL,
    CONSTRAINT "AccountableAdvanceReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountableAdvanceReimbursement" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "fundingAccountCode" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "reimbursedBy" TEXT NOT NULL,
    "reimbursedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountingEntryId" TEXT NOT NULL,
    CONSTRAINT "AccountableAdvanceReimbursement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountableAdvance_idempotencyKey_key" ON "AccountableAdvance"("idempotencyKey");
CREATE UNIQUE INDEX "AccountableAdvance_accountingEntryId_key" ON "AccountableAdvance"("accountingEntryId");
CREATE INDEX "AccountableAdvance_staffId_status_createdAt_idx" ON "AccountableAdvance"("staffId", "status", "createdAt");
CREATE INDEX "AccountableAdvance_point_status_dueAt_idx" ON "AccountableAdvance"("point", "status", "dueAt");

CREATE UNIQUE INDEX "AccountableAdvanceSettlement_idempotencyKey_key" ON "AccountableAdvanceSettlement"("idempotencyKey");
CREATE UNIQUE INDEX "AccountableAdvanceSettlement_accountingEntryId_key" ON "AccountableAdvanceSettlement"("accountingEntryId");
CREATE INDEX "AccountableAdvanceSettlement_advanceId_settledAt_idx" ON "AccountableAdvanceSettlement"("advanceId", "settledAt");

CREATE UNIQUE INDEX "AccountableAdvanceReturn_idempotencyKey_key" ON "AccountableAdvanceReturn"("idempotencyKey");
CREATE UNIQUE INDEX "AccountableAdvanceReturn_accountingEntryId_key" ON "AccountableAdvanceReturn"("accountingEntryId");
CREATE INDEX "AccountableAdvanceReturn_advanceId_returnedAt_idx" ON "AccountableAdvanceReturn"("advanceId", "returnedAt");

CREATE UNIQUE INDEX "AccountableAdvanceReimbursement_idempotencyKey_key" ON "AccountableAdvanceReimbursement"("idempotencyKey");
CREATE UNIQUE INDEX "AccountableAdvanceReimbursement_accountingEntryId_key" ON "AccountableAdvanceReimbursement"("accountingEntryId");
CREATE INDEX "AccountableAdvanceReimbursement_advanceId_reimbursedAt_idx" ON "AccountableAdvanceReimbursement"("advanceId", "reimbursedAt");

ALTER TABLE "AccountableAdvance"
  ADD CONSTRAINT "AccountableAdvance_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountableAdvance_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountableAdvanceSettlement"
  ADD CONSTRAINT "AccountableAdvanceSettlement_advanceId_fkey"
  FOREIGN KEY ("advanceId") REFERENCES "AccountableAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountableAdvanceSettlement_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountableAdvanceReturn"
  ADD CONSTRAINT "AccountableAdvanceReturn_advanceId_fkey"
  FOREIGN KEY ("advanceId") REFERENCES "AccountableAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountableAdvanceReturn_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountableAdvanceReimbursement"
  ADD CONSTRAINT "AccountableAdvanceReimbursement_advanceId_fkey"
  FOREIGN KEY ("advanceId") REFERENCES "AccountableAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountableAdvanceReimbursement_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
