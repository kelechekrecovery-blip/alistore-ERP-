ALTER TABLE "HrPayrollRun"
  ADD COLUMN "accrualAccountingEntryId" TEXT,
  ADD COLUMN "payoutAccountingEntryId" TEXT;

CREATE UNIQUE INDEX "HrPayrollRun_accrualAccountingEntryId_key" ON "HrPayrollRun"("accrualAccountingEntryId");
CREATE UNIQUE INDEX "HrPayrollRun_payoutAccountingEntryId_key" ON "HrPayrollRun"("payoutAccountingEntryId");

ALTER TABLE "HrPayrollRun"
  ADD CONSTRAINT "HrPayrollRun_accrualAccountingEntryId_fkey"
  FOREIGN KEY ("accrualAccountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HrPayrollRun_payoutAccountingEntryId_fkey"
  FOREIGN KEY ("payoutAccountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
