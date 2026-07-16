CREATE TYPE "SupplierAdvanceStatus" AS ENUM ('open', 'partially_applied', 'applied', 'cancelled');

CREATE TABLE "SupplierAdvance" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "appliedAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "SupplierAdvanceStatus" NOT NULL DEFAULT 'open',
    "paymentAccountCode" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "paidBy" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountingEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierAdvance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierInvoiceAdvanceAllocation" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "accountingEntryId" TEXT NOT NULL,
    "appliedBy" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierInvoiceAdvanceAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierAdvance_idempotencyKey_key" ON "SupplierAdvance"("idempotencyKey");
CREATE UNIQUE INDEX "SupplierAdvance_paymentKey_key" ON "SupplierAdvance"("paymentKey");
CREATE UNIQUE INDEX "SupplierAdvance_accountingEntryId_key" ON "SupplierAdvance"("accountingEntryId");
CREATE INDEX "SupplierAdvance_supplierId_status_createdAt_idx" ON "SupplierAdvance"("supplierId", "status", "createdAt");
CREATE INDEX "SupplierAdvance_status_paidAt_idx" ON "SupplierAdvance"("status", "paidAt");

CREATE UNIQUE INDEX "SupplierInvoiceAdvanceAllocation_idempotencyKey_key" ON "SupplierInvoiceAdvanceAllocation"("idempotencyKey");
CREATE UNIQUE INDEX "SupplierInvoiceAdvanceAllocation_accountingEntryId_key" ON "SupplierInvoiceAdvanceAllocation"("accountingEntryId");
CREATE INDEX "SupplierInvoiceAdvanceAllocation_advanceId_appliedAt_idx" ON "SupplierInvoiceAdvanceAllocation"("advanceId", "appliedAt");
CREATE INDEX "SupplierInvoiceAdvanceAllocation_invoiceId_appliedAt_idx" ON "SupplierInvoiceAdvanceAllocation"("invoiceId", "appliedAt");

ALTER TABLE "SupplierAdvance"
  ADD CONSTRAINT "SupplierAdvance_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierAdvance"
  ADD CONSTRAINT "SupplierAdvance_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceAdvanceAllocation"
  ADD CONSTRAINT "SupplierInvoiceAdvanceAllocation_advanceId_fkey"
  FOREIGN KEY ("advanceId") REFERENCES "SupplierAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceAdvanceAllocation"
  ADD CONSTRAINT "SupplierInvoiceAdvanceAllocation_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceAdvanceAllocation"
  ADD CONSTRAINT "SupplierInvoiceAdvanceAllocation_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AccountingAccount" ("code", "name", "type", "system", "active")
VALUES ('1300', 'Авансы поставщикам', 'asset', true, true)
ON CONFLICT ("code") DO NOTHING;
