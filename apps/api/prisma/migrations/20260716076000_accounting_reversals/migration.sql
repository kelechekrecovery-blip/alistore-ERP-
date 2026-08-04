ALTER TABLE "AccountingJournalEntry" ADD COLUMN "reversalOfId" TEXT;

CREATE UNIQUE INDEX "AccountingJournalEntry_reversalOfId_key" ON "AccountingJournalEntry"("reversalOfId");

ALTER TABLE "AccountingJournalEntry"
ADD CONSTRAINT "AccountingJournalEntry_reversalOfId_fkey"
FOREIGN KEY ("reversalOfId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
