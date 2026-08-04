ALTER TABLE "Product"
  ADD COLUMN "taxCode" TEXT NOT NULL DEFAULT 'vat_standard',
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 1200;

ALTER TABLE "Order"
  ADD COLUMN "taxBaseAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OrderItem"
  ADD COLUMN "lineNumber" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxCode" TEXT NOT NULL DEFAULT 'vat_standard',
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN "taxBaseAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ServiceWorkOrder"
  ADD COLUMN "taxCode" TEXT NOT NULL DEFAULT 'vat_standard',
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN "taxBaseAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "OrderItem_orderId_lineNumber_idx" ON "OrderItem"("orderId", "lineNumber");

-- Historical documents keep taxAmount=0 because reconstructing the legal tax
-- point from mutable catalogue data would create false accounting evidence.
-- New orders and paid-service estimates receive immutable snapshots in-domain.

CREATE TABLE "AccountingTaxSettlement" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "point" TEXT NOT NULL DEFAULT '',
  "idempotencyKey" TEXT NOT NULL,
  "outputTax" INTEGER NOT NULL,
  "inputTax" INTEGER NOT NULL,
  "offsetAmount" INTEGER NOT NULL,
  "payableAmount" INTEGER NOT NULL,
  "recoverableAmount" INTEGER NOT NULL,
  "accountingEntryId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingTaxSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingTaxSettlement_idempotencyKey_key" ON "AccountingTaxSettlement"("idempotencyKey");
CREATE UNIQUE INDEX "AccountingTaxSettlement_accountingEntryId_key" ON "AccountingTaxSettlement"("accountingEntryId");
CREATE UNIQUE INDEX "AccountingTaxSettlement_period_point_key" ON "AccountingTaxSettlement"("period", "point");
CREATE INDEX "AccountingTaxSettlement_period_createdAt_idx" ON "AccountingTaxSettlement"("period", "createdAt");

ALTER TABLE "AccountingTaxSettlement"
  ADD CONSTRAINT "AccountingTaxSettlement_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_taxRateBps_check" CHECK ("taxRateBps" >= 0 AND "taxRateBps" <= 10000);
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_tax_snapshot_check" CHECK ("taxBaseAmount" >= 0 AND "taxAmount" >= 0 AND "taxAmount" <= "total");
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_tax_snapshot_check" CHECK (
    "lineNumber" >= 0 AND "discountAmount" >= 0 AND "taxRateBps" >= 0 AND "taxRateBps" <= 10000
    AND "taxBaseAmount" >= 0 AND "taxAmount" >= 0
    AND (
      ("taxBaseAmount" = 0 AND "taxAmount" = 0 AND "discountAmount" = 0)
      OR "taxBaseAmount"::bigint + "taxAmount"::bigint + "discountAmount"::bigint = "price"::bigint * "qty"::bigint
    )
  );
ALTER TABLE "ServiceWorkOrder"
  ADD CONSTRAINT "ServiceWorkOrder_tax_snapshot_check" CHECK (
    "taxRateBps" >= 0 AND "taxRateBps" <= 10000 AND "taxBaseAmount" >= 0 AND "taxAmount" >= 0
  );
ALTER TABLE "AccountingTaxSettlement"
  ADD CONSTRAINT "AccountingTaxSettlement_amounts_check" CHECK (
    "outputTax" >= 0 AND "inputTax" >= 0 AND "offsetAmount" >= 0
    AND "payableAmount" >= 0 AND "recoverableAmount" >= 0
    AND "offsetAmount" = LEAST("outputTax", "inputTax")
    AND "payableAmount" = GREATEST("outputTax" - "inputTax", 0)
    AND "recoverableAmount" = GREATEST("inputTax" - "outputTax", 0)
  );
