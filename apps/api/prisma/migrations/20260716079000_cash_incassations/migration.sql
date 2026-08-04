-- Cash deposits move value from the drawer to the bank account and must be journal-backed.
CREATE TYPE "CashIncassationStatus" AS ENUM ('deposited', 'reconciled', 'disputed');

CREATE TABLE "CashIncassation" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "destinationCode" TEXT NOT NULL DEFAULT '1010',
    "reference" TEXT,
    "status" "CashIncassationStatus" NOT NULL DEFAULT 'deposited',
    "depositedBy" TEXT NOT NULL,
    "depositedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" TIMESTAMP(3),
    "accountingEntryId" TEXT,

    CONSTRAINT "CashIncassation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashIncassation_idempotencyKey_key" ON "CashIncassation"("idempotencyKey");
CREATE UNIQUE INDEX "CashIncassation_accountingEntryId_key" ON "CashIncassation"("accountingEntryId");
CREATE INDEX "CashIncassation_shiftId_depositedAt_idx" ON "CashIncassation"("shiftId", "depositedAt");
CREATE INDEX "CashIncassation_point_depositedAt_idx" ON "CashIncassation"("point", "depositedAt");
CREATE INDEX "CashIncassation_status_depositedAt_idx" ON "CashIncassation"("status", "depositedAt");

ALTER TABLE "CashIncassation" ADD CONSTRAINT "CashIncassation_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashIncassation" ADD CONSTRAINT "CashIncassation_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
