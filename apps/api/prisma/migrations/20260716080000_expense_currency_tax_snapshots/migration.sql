-- Immutable FX and tax snapshots make every expense reproducible in the KGS ledger.
CREATE TYPE "ExpenseTaxMode" AS ENUM ('none', 'included', 'excluded');

CREATE TABLE "AccountingCurrencyRate" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'KGS',
    "rateMicros" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingCurrencyRate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingCurrencyRate_rateMicros_check" CHECK ("rateMicros" > 0),
    CONSTRAINT "AccountingCurrencyRate_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "AccountingCurrencyRate_baseCurrency_check" CHECK ("baseCurrency" ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX "AccountingCurrencyRate_idempotencyKey_key" ON "AccountingCurrencyRate"("idempotencyKey");
CREATE UNIQUE INDEX "AccountingCurrencyRate_currency_baseCurrency_effectiveAt_key" ON "AccountingCurrencyRate"("currency", "baseCurrency", "effectiveAt");
CREATE INDEX "AccountingCurrencyRate_currency_baseCurrency_effectiveAt_idx" ON "AccountingCurrencyRate"("currency", "baseCurrency", "effectiveAt");

ALTER TABLE "Expense"
  ADD COLUMN "documentAmount" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KGS',
  ADD COLUMN "exchangeRateMicros" INTEGER NOT NULL DEFAULT 1000000,
  ADD COLUMN "exchangeRateId" TEXT,
  ADD COLUMN "taxMode" "ExpenseTaxMode" NOT NULL DEFAULT 'none',
  ADD COLUMN "taxCode" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxBaseAmount" INTEGER,
  ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Expense" SET "documentAmount" = "amount", "taxBaseAmount" = "amount";

ALTER TABLE "Expense"
  ALTER COLUMN "documentAmount" SET NOT NULL,
  ALTER COLUMN "taxBaseAmount" SET NOT NULL,
  ADD CONSTRAINT "Expense_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "Expense_documentAmount_check" CHECK ("documentAmount" > 0),
  ADD CONSTRAINT "Expense_exchangeRateMicros_check" CHECK ("exchangeRateMicros" > 0),
  ADD CONSTRAINT "Expense_taxRateBps_check" CHECK ("taxRateBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "Expense_taxAmount_check" CHECK ("taxAmount" >= 0),
  ADD CONSTRAINT "Expense_taxBaseAmount_check" CHECK ("taxBaseAmount" > 0),
  ADD CONSTRAINT "Expense_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Expense_tax_consistency_check" CHECK (
    ("taxMode" = 'none' AND "taxRateBps" = 0 AND "taxAmount" = 0 AND "taxCode" = 'none')
    OR
    ("taxMode" <> 'none' AND "taxRateBps" > 0 AND "taxAmount" > 0 AND "taxCode" <> 'none')
  );

CREATE INDEX "Expense_currency_incurredAt_idx" ON "Expense"("currency", "incurredAt");
CREATE INDEX "Expense_exchangeRateId_idx" ON "Expense"("exchangeRateId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_exchangeRateId_fkey"
  FOREIGN KEY ("exchangeRateId") REFERENCES "AccountingCurrencyRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingJournalEntry"
  ADD COLUMN "documentAmount" INTEGER,
  ADD COLUMN "exchangeRateMicros" INTEGER NOT NULL DEFAULT 1000000,
  ADD COLUMN "baseAmount" INTEGER,
  ADD COLUMN "taxCode" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "AccountingJournalEntry_exchangeRateMicros_check" CHECK ("exchangeRateMicros" > 0),
  ADD CONSTRAINT "AccountingJournalEntry_taxRateBps_check" CHECK ("taxRateBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "AccountingJournalEntry_taxAmount_check" CHECK ("taxAmount" >= 0);

INSERT INTO "AccountingAccount" ("code", "name", "type") VALUES
  ('1210', 'Возмещаемый входной налог', 'asset')
ON CONFLICT ("code") DO NOTHING;
