-- Оплата при получении перестаёт быть привилегией курьера.
--
-- Инвариант `Order_cod_courier_check` (миграция 20260716147000) требовал
-- `paymentMode <> 'cod' OR fulfillmentType = 'courier'`. Он писался тогда, когда
-- самовывоз оплачивался онлайн. После перехода магазина на оплату наличными
-- предоплата отдаёт 503 (`online_payments_unavailable`), и самовывоз — способ
-- получения по умолчанию — остался без единого рабочего метода оплаты: магазин,
-- объявленный «наличными при получении», наличные запрещал.
--
-- Самовывоз и выдача в магазине курьерской механики не требуют: человек
-- приходит к прилавку и платит кассиру, `Payment` создаёт касса.
--
-- Экспресс остаётся под запретом обоснованно: такие заказы не попадают в
-- курьерский рейс (`courier.service.ts` требует `fulfillmentType = 'courier'`),
-- то есть собрать по ним деньги нечем и спросить их не с кого.
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_cod_courier_check";

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_cod_fulfillment_check"
  CHECK ("paymentMode" <> 'cod' OR "fulfillmentType" <> 'express') NOT VALID;

ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_cod_fulfillment_check";
