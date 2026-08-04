DROP TRIGGER IF EXISTS "ExchangeRequest_snapshot_guard" ON "ExchangeRequest";

ALTER TABLE "ExchangeRequest" ADD COLUMN "newUnitId" TEXT;

UPDATE "ExchangeRequest" request
SET "newUnitId" = unit.id
FROM "DeviceUnit" unit
WHERE unit.imei = request."newImei";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ExchangeRequest" WHERE "newUnitId" IS NULL) THEN
    RAISE EXCEPTION 'ExchangeRequest replacement unit backfill is incomplete';
  END IF;
END;
$$;

ALTER TABLE "ExchangeRequest" ALTER COLUMN "newUnitId" SET NOT NULL;
ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_originalOrderId_fkey"
  FOREIGN KEY ("originalOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_oldImei_fkey"
  FOREIGN KEY ("oldImei") REFERENCES "DeviceUnit"("imei") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_newProductId_fkey"
  FOREIGN KEY ("newProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_newUnitId_fkey"
  FOREIGN KEY ("newUnitId") REFERENCES "DeviceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_exchangeOrderId_fkey"
  FOREIGN KEY ("exchangeOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ExchangeRequest_newUnitId_idx" ON "ExchangeRequest"("newUnitId");
CREATE UNIQUE INDEX "ExchangeRequest_requested_oldImei_key"
  ON "ExchangeRequest"("oldImei") WHERE status = 'requested';
CREATE UNIQUE INDEX "ExchangeRequest_requested_newUnitId_key"
  ON "ExchangeRequest"("newUnitId") WHERE status = 'requested';

CREATE OR REPLACE FUNCTION alistore_guard_exchange_request_snapshot()
RETURNS trigger AS $$
BEGIN
  IF ROW(
    NEW.id, NEW."idempotencyKey", NEW."approvalId", NEW."requester", NEW."originalOrderId",
    NEW."oldImei", NEW."newProductId", NEW."newUnitId", NEW."newImei", NEW."creditAmount",
    NEW."surchargeAmount", NEW."method", NEW."shiftId", NEW."externalReference",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD."idempotencyKey", OLD."approvalId", OLD."requester", OLD."originalOrderId",
    OLD."oldImei", OLD."newProductId", OLD."newUnitId", OLD."newImei", OLD."creditAmount",
    OLD."surchargeAmount", OLD."method", OLD."shiftId", OLD."externalReference",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'ExchangeRequest snapshot is immutable';
  END IF;
  IF OLD."status" <> 'requested' OR NEW."status" NOT IN ('executed', 'rejected') THEN
    RAISE EXCEPTION 'Invalid ExchangeRequest lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExchangeRequest_snapshot_guard"
BEFORE UPDATE ON "ExchangeRequest"
FOR EACH ROW EXECUTE FUNCTION alistore_guard_exchange_request_snapshot();

CREATE OR REPLACE FUNCTION alistore_reject_exchange_request_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ExchangeRequest is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExchangeRequest_delete_guard"
BEFORE DELETE ON "ExchangeRequest"
FOR EACH ROW EXECUTE FUNCTION alistore_reject_exchange_request_delete();

CREATE OR REPLACE FUNCTION alistore_require_approved_exchange_order()
RETURNS trigger AS $$
DECLARE
  approval_id TEXT;
BEGIN
  IF NEW.channel <> 'exchange' THEN
    RETURN NEW;
  END IF;
  IF NEW."idempotencyKey" IS NULL OR NEW."idempotencyKey" NOT LIKE 'exchange:approval:%' THEN
    RAISE EXCEPTION 'exchange order requires an approved ExchangeRequest';
  END IF;
  approval_id := substring(NEW."idempotencyKey" FROM length('exchange:approval:') + 1);
  IF NOT EXISTS (
    SELECT 1
    FROM "Approval" approval
    JOIN "ExchangeRequest" request ON request."approvalId" = approval.id
    WHERE approval.id = approval_id
      AND approval.status = 'approved'
      AND request.status = 'requested'
  ) THEN
    RAISE EXCEPTION 'exchange approval context is missing or resolved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_exchange_approval_guard"
BEFORE INSERT OR UPDATE OF channel, "idempotencyKey" ON "Order"
FOR EACH ROW EXECUTE FUNCTION alistore_require_approved_exchange_order();
