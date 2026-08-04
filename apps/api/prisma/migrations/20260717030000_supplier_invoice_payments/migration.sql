ALTER TYPE "SupplierInvoiceStatus" ADD VALUE IF NOT EXISTS 'partially_paid';

CREATE TABLE "SupplierInvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentAccountCode" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "paidBy" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountingEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierInvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierInvoicePayment_idempotencyKey_key" ON "SupplierInvoicePayment"("idempotencyKey");
CREATE UNIQUE INDEX "SupplierInvoicePayment_paymentKey_key" ON "SupplierInvoicePayment"("paymentKey");
CREATE UNIQUE INDEX "SupplierInvoicePayment_accountingEntryId_key" ON "SupplierInvoicePayment"("accountingEntryId");
CREATE INDEX "SupplierInvoicePayment_invoiceId_paidAt_idx" ON "SupplierInvoicePayment"("invoiceId", "paidAt");
CREATE INDEX "SupplierInvoicePayment_paymentAccountCode_paidAt_idx" ON "SupplierInvoicePayment"("paymentAccountCode", "paidAt");

ALTER TABLE "SupplierInvoicePayment"
  ADD CONSTRAINT "SupplierInvoicePayment_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoicePayment"
  ADD CONSTRAINT "SupplierInvoicePayment_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
