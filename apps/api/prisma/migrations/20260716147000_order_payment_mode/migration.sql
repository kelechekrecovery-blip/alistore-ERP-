BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "Order"
  ADD COLUMN "paymentMode" TEXT NOT NULL DEFAULT 'prepaid',
  ADD COLUMN "paymentModeExplicit" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "idempotencyRequestHash" TEXT;

ALTER TABLE "OrderItem"
  ADD COLUMN "inventorySnapshot" JSONB;

ALTER TABLE "OrderBundleAllocation"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "releasedAt" TIMESTAMP(3),
  ADD COLUMN "consumedAt" TIMESTAMP(3);

-- These tables are read during backfill and receive compatibility triggers
-- later in this same transaction. Block old-process writes until both steps
-- commit so no release, ownership or payment transition can fall in between.
LOCK TABLE "Reservation", "DeviceUnit", "Payment" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "OrderBundleAllocation" allocation
    LEFT JOIN "DeviceUnit" unit ON unit.imei = allocation.imei
    WHERE unit.id IS NULL
       OR (unit.status IN ('reserved', 'sold') AND unit."orderId" IS DISTINCT FROM allocation."orderId")
       OR EXISTS (
         SELECT 1 FROM "Reservation" reservation
         WHERE reservation.imei = allocation.imei
           AND reservation.active = true
           AND reservation."orderId" IS DISTINCT FROM allocation."orderId"
       )
       OR (
         SELECT COUNT(*) FROM "Reservation" reservation
         WHERE reservation.imei = allocation.imei
           AND reservation.active = true
       ) > 1
       OR (
         unit.status = 'reserved'
         AND unit."orderId" = allocation."orderId"
         AND (
           SELECT COUNT(*) FROM "Reservation" reservation
           WHERE reservation."orderId" = allocation."orderId"
             AND reservation.imei = allocation.imei
             AND reservation.active = true
         ) <> 1
       )
       OR (
         EXISTS (
           SELECT 1 FROM "Reservation" reservation
           WHERE reservation."orderId" = allocation."orderId"
             AND reservation.imei = allocation.imei
             AND reservation.active = true
         )
         AND (unit.status <> 'reserved' OR unit."orderId" IS DISTINCT FROM allocation."orderId")
       )
  ) THEN
    RAISE EXCEPTION 'Ambiguous legacy OrderBundleAllocation ownership; reconcile before migration';
  END IF;
END $$;

UPDATE "OrderBundleAllocation" AS allocation
SET "active" = false,
    "consumedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM "DeviceUnit" AS unit
    WHERE unit.imei = allocation.imei
      AND unit."orderId" = allocation."orderId"
      AND unit.status = 'sold'
  );

-- Only a live reservation with matching device ownership remains active.
-- Cancelled/expired historical attempts retain their audit row but release the
-- IMEI for a later active allocation.
UPDATE "OrderBundleAllocation" AS allocation
SET "active" = false,
    "releasedAt" = CURRENT_TIMESTAMP
WHERE allocation."active" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "Reservation" reservation
    JOIN "DeviceUnit" unit ON unit.imei = reservation.imei
    WHERE reservation."orderId" = allocation."orderId"
      AND reservation.imei = allocation.imei
      AND reservation.active = true
      AND unit.status = 'reserved'
      AND unit."orderId" = allocation."orderId"
  );

-- Rolling-deploy compatibility: the previous API only flips Reservation.active
-- after releasing or selling a unit. Keep the new allocation lifecycle correct
-- until every old process has drained.
CREATE OR REPLACE FUNCTION "sync_bundle_allocation_lifecycle_from_reservation"()
RETURNS TRIGGER AS $$
DECLARE
  was_consumed BOOLEAN;
BEGIN
  IF OLD.active = true AND NEW.active = false AND NEW.imei IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM "DeviceUnit" unit
      WHERE unit.imei = NEW.imei
        AND unit.status = 'sold'
        AND unit."orderId" = NEW."orderId"
    ) INTO was_consumed;

    UPDATE "OrderBundleAllocation"
    SET active = false,
        "consumedAt" = CASE WHEN was_consumed THEN CURRENT_TIMESTAMP ELSE NULL END,
        "releasedAt" = CASE WHEN was_consumed THEN NULL ELSE CURRENT_TIMESTAMP END
    WHERE "orderId" = NEW."orderId"
      AND imei = NEW.imei
      AND active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Reservation_sync_bundle_allocation_lifecycle"
AFTER UPDATE OF active ON "Reservation"
FOR EACH ROW
EXECUTE FUNCTION "sync_bundle_allocation_lifecycle_from_reservation"();

ALTER TABLE "OrderBundleAllocation"
  ADD CONSTRAINT "OrderBundleAllocation_lifecycle_check"
  CHECK (
    (active = true AND "releasedAt" IS NULL AND "consumedAt" IS NULL)
    OR
    (active = false AND num_nonnulls("releasedAt", "consumedAt") = 1)
  ) NOT VALID;

-- Preserve in-flight legacy COD deliveries that entered the old operational
-- pipeline without full settlement. Historically `paid` also represented an
-- accepted COD order, so under-settled paid/picking rows must not be stranded.
UPDATE "Order" AS orders
SET "paymentMode" = 'cod'
WHERE orders."fulfillmentType" = 'courier'
  AND orders."status" IN ('paid', 'picking', 'packed', 'courier_assigned', 'out_for_delivery', 'delivered', 'completed', 'return_requested', 'returned', 'exchanged', 'refunded')
  AND orders."total" > COALESCE((
    SELECT SUM(payment."amount")
    FROM "Payment" AS payment
    WHERE payment."orderId" = orders."id"
      AND payment."amount" > 0
      AND payment."status" IN ('received', 'reconciled')
  ), 0);

-- Rolling-deploy compatibility: old API processes omit paymentMode. Once such
-- an order enters the delivery pipeline, derive COD from the authoritative
-- received-tender total. A later full payment restores prepaid classification.
CREATE OR REPLACE FUNCTION "classify_legacy_courier_payment_mode"()
RETURNS TRIGGER AS $$
DECLARE
  settled INTEGER;
BEGIN
  IF NEW."paymentModeExplicit" = false
     AND NEW."fulfillmentType" = 'courier'
     AND NEW.status IN ('paid', 'picking', 'packed', 'courier_assigned', 'out_for_delivery', 'delivered', 'completed', 'return_requested', 'returned', 'exchanged', 'refunded') THEN
    SELECT COALESCE(SUM(payment.amount), 0)
    INTO settled
    FROM "Payment" payment
    WHERE payment."orderId" = NEW.id
      AND payment.amount > 0
      AND payment.status IN ('received', 'reconciled');
    IF settled < NEW.total AND NEW."paymentMode" = 'prepaid' THEN
      NEW."paymentMode" := 'cod';
    ELSIF settled >= NEW.total AND NEW."paymentMode" = 'cod' THEN
      NEW."paymentMode" := 'prepaid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_classify_legacy_courier_payment_mode"
BEFORE INSERT OR UPDATE OF status, "fulfillmentType", total ON "Order"
FOR EACH ROW
EXECUTE FUNCTION "classify_legacy_courier_payment_mode"();

CREATE OR REPLACE FUNCTION "reconcile_legacy_courier_payment_mode_from_payment"()
RETURNS TRIGGER AS $$
DECLARE
  target_order_id TEXT;
  settled INTEGER;
  old_order_id TEXT;
  new_order_id TEXT;
BEGIN
  old_order_id := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD."orderId" ELSE NULL END;
  new_order_id := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW."orderId" ELSE NULL END;

  -- Lock every affected order in deterministic order before taking payment
  -- aggregates. This removes stale last-writer classification and avoids a
  -- reverse orderId update deadlock.
  FOR target_order_id IN
    SELECT DISTINCT candidate.id
    FROM (VALUES (old_order_id), (new_order_id)) AS candidate(id)
    WHERE candidate.id IS NOT NULL
    ORDER BY candidate.id
  LOOP
    PERFORM 1 FROM "Order" orders WHERE orders.id = target_order_id FOR UPDATE;
  END LOOP;

  FOR target_order_id IN
    SELECT DISTINCT candidate.id
    FROM (VALUES (old_order_id), (new_order_id)) AS candidate(id)
    WHERE candidate.id IS NOT NULL
    ORDER BY candidate.id
  LOOP
    SELECT COALESCE(SUM(payment.amount), 0)
    INTO settled
    FROM "Payment" payment
    WHERE payment."orderId" = target_order_id
      AND payment.amount > 0
      AND payment.status IN ('received', 'reconciled');

    UPDATE "Order" orders
    SET "paymentMode" = CASE WHEN settled >= orders.total THEN 'prepaid' ELSE 'cod' END
    WHERE orders.id = target_order_id
      AND orders."paymentModeExplicit" = false
      AND orders."fulfillmentType" = 'courier'
      AND orders.status IN ('paid', 'picking', 'packed', 'courier_assigned', 'out_for_delivery', 'delivered', 'completed', 'return_requested', 'returned', 'exchanged', 'refunded');
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Payment_reconcile_legacy_courier_payment_mode"
AFTER INSERT OR UPDATE OF amount, status, "orderId" OR DELETE ON "Payment"
FOR EACH ROW
EXECUTE FUNCTION "reconcile_legacy_courier_payment_mode_from_payment"();

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_paymentMode_check"
  CHECK ("paymentMode" IN ('prepaid', 'cod')) NOT VALID,
  ADD CONSTRAINT "Order_cod_courier_check"
  CHECK ("paymentMode" <> 'cod' OR "fulfillmentType" = 'courier') NOT VALID;

ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_paymentMode_check";
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_cod_courier_check";
ALTER TABLE "OrderBundleAllocation" VALIDATE CONSTRAINT "OrderBundleAllocation_lifecycle_check";

ALTER TABLE "CourierRun"
  ADD COLUMN "assignmentIdempotencyKey" TEXT;

-- The unique index is built CONCURRENTLY by postdeploy-indexes.mjs so an
-- upgrade does not block dispatch writes on an existing CourierRun table.

COMMIT;
