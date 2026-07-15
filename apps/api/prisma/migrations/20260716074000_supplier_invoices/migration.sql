CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('draft', 'approved', 'paid', 'cancelled');

CREATE TABLE "SupplierInvoice" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "matchedReceiptValue" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3),
  "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'draft',
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "paymentKey" TEXT,
  "paymentAccountCode" TEXT,
  "paymentReference" TEXT,
  "paidBy" TEXT,
  "paidAt" TIMESTAMP(3),
  "accountingEntryId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierInvoice_idempotencyKey_key" ON "SupplierInvoice"("idempotencyKey");
CREATE UNIQUE INDEX "SupplierInvoice_paymentKey_key" ON "SupplierInvoice"("paymentKey");
CREATE UNIQUE INDEX "SupplierInvoice_accountingEntryId_key" ON "SupplierInvoice"("accountingEntryId");
CREATE UNIQUE INDEX "SupplierInvoice_supplierId_invoiceNumber_key" ON "SupplierInvoice"("supplierId", "invoiceNumber");
CREATE INDEX "SupplierInvoice_status_dueDate_idx" ON "SupplierInvoice"("status", "dueDate");
CREATE INDEX "SupplierInvoice_supplierId_createdAt_idx" ON "SupplierInvoice"("supplierId", "createdAt");
CREATE INDEX "SupplierInvoice_purchaseOrderId_idx" ON "SupplierInvoice"("purchaseOrderId");

ALTER TABLE "SupplierInvoice"
  ADD CONSTRAINT "SupplierInvoice_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice"
  ADD CONSTRAINT "SupplierInvoice_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice"
  ADD CONSTRAINT "SupplierInvoice_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
