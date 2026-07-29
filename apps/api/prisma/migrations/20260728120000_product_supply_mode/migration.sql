-- Политика поставки товара.
--
-- own_stock — продаём из своего остатка (текущее и единственное поведение до этой
-- миграции, поэтому это дефолт и backfill существующих строк тривиален).
-- to_order  — товара на складе нет, он закупается у поставщика под конкретный
--             заказ; покупателю обязаны показать срок поставки.
--
-- Инвариант ставится в БД, а не только в DTO: товар «под заказ» без срока
-- поставки — это молчаливое враньё покупателю, и запретить его надо на самом
-- нижнем уровне. Диапазон 1..180 отсекает опечатки вроде 400 дней.

CREATE TYPE "SupplyMode" AS ENUM ('own_stock', 'to_order');

ALTER TABLE "Product"
  ADD COLUMN "supplyMode" "SupplyMode" NOT NULL DEFAULT 'own_stock',
  ADD COLUMN "supplyLeadDays" INTEGER,
  ADD COLUMN "supplierId" TEXT;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_supply_lead_days_check"
  CHECK ("supplyMode" <> 'to_order' OR "supplyLeadDays" IS NOT NULL);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_supply_lead_days_range_check"
  CHECK ("supplyLeadDays" IS NULL OR ("supplyLeadDays" >= 1 AND "supplyLeadDays" <= 180));

-- Обратная сторона того же инварианта: у товара своего стока срока поставки быть
-- не должно. Иначе от прошлой политики остаётся значение, которое однажды
-- покажут покупателю как обещание.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_supply_lead_days_own_stock_check"
  CHECK ("supplyMode" <> 'own_stock' OR "supplyLeadDays" IS NULL);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Product_supplyMode_idx" ON "Product"("supplyMode");
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");
