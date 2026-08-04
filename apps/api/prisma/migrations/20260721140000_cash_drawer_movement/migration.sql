-- Наличные, вошедшие в ящик или вышедшие из него не через Payment.
--
-- Ожидаемый остаток смены считался как openCash + Σ Payment(cash, shiftId),
-- поэтому пять каналов двигали реальную наличность мимо сверки: сдача COD
-- курьером, выпуск подарочной карты, выплата комитенту, выкуп trade-in и залог
-- подменного фонда. Смена с продажей карт на 50 000 и выплатой комитенту 90 000
-- давала недостачу 40 000 на пустом месте.
--
-- Форма повторяет CashIncassation. Отдельный Payment для этих движений создавать
-- нельзя: он удвоил бы выручку (salesGross = Payment + cod.receivable).
CREATE TABLE "CashDrawerMovement" (
  "id"                TEXT NOT NULL,
  "idempotencyKey"    TEXT NOT NULL,
  "shiftId"           TEXT NOT NULL,
  "point"             TEXT NOT NULL,
  "amount"            INTEGER NOT NULL,
  "kind"              TEXT NOT NULL,
  "sourceType"        TEXT,
  "sourceRef"         TEXT,
  "reason"            TEXT,
  "createdBy"         TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accountingEntryId" TEXT,
  CONSTRAINT "CashDrawerMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashDrawerMovement_idempotencyKey_key" ON "CashDrawerMovement"("idempotencyKey");
CREATE UNIQUE INDEX "CashDrawerMovement_accountingEntryId_key" ON "CashDrawerMovement"("accountingEntryId");
CREATE INDEX "CashDrawerMovement_shiftId_createdAt_idx" ON "CashDrawerMovement"("shiftId", "createdAt");
CREATE INDEX "CashDrawerMovement_point_createdAt_idx" ON "CashDrawerMovement"("point", "createdAt");

ALTER TABLE "CashDrawerMovement"
  ADD CONSTRAINT "CashDrawerMovement_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CashDrawerMovement"
  ADD CONSTRAINT "CashDrawerMovement_accountingEntryId_fkey"
  FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Нулевое движение — всегда ошибка вызывающего, а не бизнес-случай.
ALTER TABLE "CashDrawerMovement"
  ADD CONSTRAINT "CashDrawerMovement_amount_check" CHECK ("amount" <> 0);

-- Залог за подменное устройство — обязательство магазина перед клиентом.
-- Деньги приходят в кассу при выдаче и возвращаются при возврате аппарата;
-- собственного счёта у них не было, поэтому залог не проводился нигде и
-- превращался в необъяснимый излишек, а потом в недостачу.
INSERT INTO "AccountingAccount" ("code", "name", "type")
VALUES ('2400', 'Залоги клиентов', 'liability')
ON CONFLICT ("code") DO NOTHING;
