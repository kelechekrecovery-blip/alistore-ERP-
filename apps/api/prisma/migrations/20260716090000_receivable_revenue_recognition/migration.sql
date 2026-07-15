-- One debt plan per order and immutable linkage to its revenue-recognition entry.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DebtPlan"
    GROUP BY "orderId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'DebtPlan contains duplicate orderId values; reconcile them before applying receivable recognition';
  END IF;
END $$;

ALTER TABLE "DebtPlan"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "accountingEntryId" TEXT;

CREATE UNIQUE INDEX "DebtPlan_orderId_key" ON "DebtPlan"("orderId");
CREATE UNIQUE INDEX "DebtPlan_idempotencyKey_key" ON "DebtPlan"("idempotencyKey");
CREATE UNIQUE INDEX "DebtPlan_accountingEntryId_key" ON "DebtPlan"("accountingEntryId");

ALTER TABLE "DebtPlan"
  ADD CONSTRAINT "DebtPlan_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
