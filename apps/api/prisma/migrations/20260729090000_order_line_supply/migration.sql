-- Слайс 3 плана docs/SUPPLY-TO-ORDER-PLAN.md: связка клиентской строки заказа
-- с закупкой у поставщика.
--
-- Прямой FK Order → PurchaseOrder был бы неверен: один PO поставщику
-- аггрегирует строки нескольких клиентских заказов. Поэтому связь идёт через
-- отдельную таблицу на КАЖДУЮ строку заказа: "OrderLineSupply.orderItemId"
-- уникален (одна запись поставки на строку — check-then-insert здесь заменён
-- на констрейнт), "purchaseOrderItemId" NULL до фактического размещения PO
-- (на awaiting_supplier закупки у поставщика физически ещё не существует) и
-- тоже уникален — одна строка PO не может обслуживать две клиентских строки.

CREATE TYPE "OrderLineSupplyStatus" AS ENUM (
  'awaiting_supplier',
  'ordered',
  'in_transit',
  'received',
  'handed_over',
  'cancelled'
);

CREATE TABLE "OrderLineSupply" (
  "id"                  TEXT NOT NULL,
  "orderItemId"         TEXT NOT NULL,
  "purchaseOrderItemId" TEXT,
  "status"              "OrderLineSupplyStatus" NOT NULL DEFAULT 'awaiting_supplier',
  "expectedAt"          TIMESTAMP(3),
  "actor"               TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderLineSupply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderLineSupply_orderItemId_key" ON "OrderLineSupply"("orderItemId");
CREATE UNIQUE INDEX "OrderLineSupply_purchaseOrderItemId_key" ON "OrderLineSupply"("purchaseOrderItemId");
CREATE INDEX "OrderLineSupply_status_idx" ON "OrderLineSupply"("status");

ALTER TABLE "OrderLineSupply"
  ADD CONSTRAINT "OrderLineSupply_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderLineSupply"
  ADD CONSTRAINT "OrderLineSupply_purchaseOrderItemId_fkey"
  FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Инвариант в БД, не только в сервисе: пока PO не размещён (purchaseOrderItemId
-- IS NULL), статус не может быть дальше "awaiting_supplier"/"cancelled" — иначе
-- строку можно было бы объявить "ordered" без реально существующей закупки.
ALTER TABLE "OrderLineSupply"
  ADD CONSTRAINT "OrderLineSupply_purchase_order_item_required_check"
  CHECK ("purchaseOrderItemId" IS NOT NULL OR "status" IN ('awaiting_supplier', 'cancelled'));
