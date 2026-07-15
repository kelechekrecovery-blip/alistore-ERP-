INSERT INTO "AccountingAccount" ("code", "name", "type") VALUES
  ('2300', 'Обязательства по подарочным картам', 'liability')
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "Payment"
  ADD COLUMN "accountCode" TEXT,
  ADD COLUMN "accountingEntryId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "receivedBy" TEXT,
  ADD COLUMN "point" TEXT;

CREATE UNIQUE INDEX "Payment_accountingEntryId_key" ON "Payment"("accountingEntryId");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_accountCode_createdAt_idx" ON "Payment"("accountCode", "createdAt");
CREATE INDEX "Payment_point_createdAt_idx" ON "Payment"("point", "createdAt");

-- Bring historical non-pending money rows into the journal without pretending
-- that a missing legacy drawer/actor was known. Those exceptions remain visible
-- through nullable shiftId/receivedBy and can be reconciled separately.
INSERT INTO "AccountingJournalEntry" (
  "id", "idempotencyKey", "sourceType", "sourceRef", "description",
  "point", "occurredAt", "createdBy"
)
SELECT
  'migration-payment-entry-' || p."id",
  'accounting:migration:payment:' || p."id",
  CASE WHEN p."amount" < 0 THEN 'payment.refund' ELSE 'payment.receipt' END,
  p."id",
  CASE WHEN p."amount" < 0 THEN 'Возврат платежа ' ELSE 'Получение платежа ' END || p."id",
  COALESCE(s."point", o."fulfillmentLocation"),
  p."createdAt",
  'migration:20260716060000'
FROM "Payment" p
LEFT JOIN "CashShift" s ON s."id" = p."shiftId"
LEFT JOIN "Order" o ON o."id" = p."orderId"
WHERE p."status" <> 'pending' AND p."amount" <> 0
  AND NOT EXISTS (
    SELECT 1 FROM "AccountingJournalEntry" e
    WHERE e."sourceType" IN ('payment.receipt', 'payment.refund') AND e."sourceRef" = p."id"
  );

INSERT INTO "AccountingJournalLine" ("id", "entryId", "accountCode", "debit", "credit", "memo")
SELECT
  'migration-payment-line-asset-' || p."id",
  'migration-payment-entry-' || p."id",
  CASE WHEN p."method" = 'cash' THEN '1000' WHEN p."method" = 'gift_card' THEN '2300' ELSE '1020' END,
  CASE WHEN p."amount" > 0 THEN p."amount" ELSE 0 END,
  CASE WHEN p."amount" < 0 THEN ABS(p."amount") ELSE 0 END,
  'Денежная сторона исторического платежа'
FROM "Payment" p
WHERE p."status" <> 'pending' AND p."amount" <> 0
  AND EXISTS (SELECT 1 FROM "AccountingJournalEntry" e WHERE e."id" = 'migration-payment-entry-' || p."id");

INSERT INTO "AccountingJournalLine" ("id", "entryId", "accountCode", "debit", "credit", "memo")
SELECT
  'migration-payment-line-revenue-' || p."id",
  'migration-payment-entry-' || p."id",
  CASE WHEN p."serviceWorkOrderId" IS NOT NULL THEN '4100' ELSE '4000' END,
  CASE WHEN p."amount" < 0 THEN ABS(p."amount") ELSE 0 END,
  CASE WHEN p."amount" > 0 THEN p."amount" ELSE 0 END,
  'Доходная сторона исторического платежа'
FROM "Payment" p
WHERE p."status" <> 'pending' AND p."amount" <> 0
  AND EXISTS (SELECT 1 FROM "AccountingJournalEntry" e WHERE e."id" = 'migration-payment-entry-' || p."id");

UPDATE "Payment" p
SET
  "accountCode" = CASE WHEN p."method" = 'cash' THEN '1000' WHEN p."method" = 'gift_card' THEN '2300' ELSE '1020' END,
  "accountingEntryId" = 'migration-payment-entry-' || p."id",
  "idempotencyKey" = COALESCE('legacy-txn:' || p."txnId", 'legacy-payment:' || p."id"),
  "point" = COALESCE(
    (SELECT s."point" FROM "CashShift" s WHERE s."id" = p."shiftId"),
    (SELECT o."fulfillmentLocation" FROM "Order" o WHERE o."id" = p."orderId")
  )
WHERE p."status" <> 'pending' AND p."amount" <> 0;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_accountCode_fkey"
  FOREIGN KEY ("accountCode") REFERENCES "AccountingAccount"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
