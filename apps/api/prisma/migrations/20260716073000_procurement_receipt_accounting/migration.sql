ALTER TABLE "PurchaseReceipt"
  ADD COLUMN "accountingEntryId" TEXT;

CREATE UNIQUE INDEX "PurchaseReceipt_accountingEntryId_key"
  ON "PurchaseReceipt"("accountingEntryId");

ALTER TABLE "PurchaseReceipt"
  ADD CONSTRAINT "PurchaseReceipt_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
