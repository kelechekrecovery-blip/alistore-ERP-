CREATE TYPE "AccountingAccountType" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

ALTER TABLE "Expense"
  ADD COLUMN "paymentAccountCode" TEXT,
  ADD COLUMN "paymentReference" TEXT;

CREATE TABLE "AccountingAccount" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AccountingAccountType" NOT NULL,
  "system" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "AccountingJournalEntry" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "point" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'KGS',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "AccountingJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingJournalLine" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "accountCode" TEXT NOT NULL,
  "debit" INTEGER NOT NULL DEFAULT 0,
  "credit" INTEGER NOT NULL DEFAULT 0,
  "memo" TEXT,
  CONSTRAINT "AccountingJournalLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingJournalLine_positive_one_side_check"
    CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
);

CREATE UNIQUE INDEX "AccountingJournalEntry_idempotencyKey_key" ON "AccountingJournalEntry"("idempotencyKey");
CREATE UNIQUE INDEX "AccountingJournalEntry_sourceType_sourceRef_key" ON "AccountingJournalEntry"("sourceType", "sourceRef");
CREATE INDEX "AccountingAccount_type_active_idx" ON "AccountingAccount"("type", "active");
CREATE INDEX "AccountingJournalEntry_occurredAt_point_idx" ON "AccountingJournalEntry"("occurredAt", "point");
CREATE INDEX "AccountingJournalEntry_sourceType_occurredAt_idx" ON "AccountingJournalEntry"("sourceType", "occurredAt");
CREATE INDEX "AccountingJournalLine_entryId_idx" ON "AccountingJournalLine"("entryId");
CREATE INDEX "AccountingJournalLine_accountCode_entryId_idx" ON "AccountingJournalLine"("accountCode", "entryId");

ALTER TABLE "AccountingJournalLine"
  ADD CONSTRAINT "AccountingJournalLine_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingJournalLine"
  ADD CONSTRAINT "AccountingJournalLine_accountCode_fkey"
  FOREIGN KEY ("accountCode") REFERENCES "AccountingAccount"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AccountingAccount" ("code", "name", "type") VALUES
  ('1000', 'Наличные в кассе', 'asset'),
  ('1010', 'Расчётный счёт', 'asset'),
  ('1020', 'Деньги у платёжных провайдеров', 'asset'),
  ('1100', 'Дебиторская задолженность', 'asset'),
  ('1200', 'Товарные запасы', 'asset'),
  ('2000', 'Задолженность поставщикам', 'liability'),
  ('2100', 'Задолженность по зарплате', 'liability'),
  ('2200', 'Налоги к уплате', 'liability'),
  ('3000', 'Капитал владельца', 'equity'),
  ('4000', 'Выручка от продаж', 'revenue'),
  ('4100', 'Выручка сервисного центра', 'revenue'),
  ('5000', 'Себестоимость продаж', 'expense'),
  ('6100', 'Расходы на зарплату', 'expense'),
  ('6200', 'Аренда', 'expense'),
  ('6300', 'Логистика', 'expense'),
  ('6400', 'Маркетинг', 'expense'),
  ('6500', 'Коммунальные расходы', 'expense'),
  ('6600', 'Расходы на закупку', 'expense'),
  ('6900', 'Прочие операционные расходы', 'expense'),
  ('6990', 'Финансовые расхождения', 'expense');
