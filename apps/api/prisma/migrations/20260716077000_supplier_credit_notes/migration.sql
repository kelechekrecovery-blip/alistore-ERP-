CREATE TYPE "SupplierCreditNoteStatus" AS ENUM ('draft', 'approved', 'applied', 'cancelled');

CREATE TABLE "SupplierCreditNote" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SupplierCreditNoteStatus" NOT NULL DEFAULT 'draft',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "appliedAt" TIMESTAMP(3),
    "accountingEntryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierCreditNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierCreditNote_idempotencyKey_key" ON "SupplierCreditNote"("idempotencyKey");
CREATE UNIQUE INDEX "SupplierCreditNote_supplierId_noteNumber_key" ON "SupplierCreditNote"("supplierId", "noteNumber");
CREATE UNIQUE INDEX "SupplierCreditNote_accountingEntryId_key" ON "SupplierCreditNote"("accountingEntryId");
CREATE INDEX "SupplierCreditNote_invoiceId_status_idx" ON "SupplierCreditNote"("invoiceId", "status");
CREATE INDEX "SupplierCreditNote_supplierId_createdAt_idx" ON "SupplierCreditNote"("supplierId", "createdAt");

ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
