DROP TRIGGER IF EXISTS "ExchangeRequest_snapshot_guard" ON "ExchangeRequest";

ALTER TABLE "ExchangeRequest" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "ExchangeRequest" ADD COLUMN "expiredAt" TIMESTAMP(3);
UPDATE "ExchangeRequest" SET "expiresAt" = "createdAt" + INTERVAL '30 minutes';
ALTER TABLE "ExchangeRequest" ALTER COLUMN "expiresAt" SET NOT NULL;

ALTER TABLE "ExchangeRequest" DROP CONSTRAINT "ExchangeRequest_status_check";
ALTER TABLE "ExchangeRequest" DROP CONSTRAINT "ExchangeRequest_resolution_check";
ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_status_check" CHECK (status IN ('requested', 'executed', 'rejected', 'expired'));
ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_resolution_check" CHECK (
    (status = 'requested' AND "exchangeOrderId" IS NULL AND "returnId" IS NULL AND "executedAt" IS NULL AND "rejectedAt" IS NULL AND "expiredAt" IS NULL)
    OR (status = 'executed' AND "exchangeOrderId" IS NOT NULL AND "returnId" IS NOT NULL AND "executedAt" IS NOT NULL AND "rejectedAt" IS NULL AND "expiredAt" IS NULL)
    OR (status = 'rejected' AND "exchangeOrderId" IS NULL AND "returnId" IS NULL AND "executedAt" IS NULL AND "rejectedAt" IS NOT NULL AND "expiredAt" IS NULL)
    OR (status = 'expired' AND "exchangeOrderId" IS NULL AND "returnId" IS NULL AND "executedAt" IS NULL AND "rejectedAt" IS NULL AND "expiredAt" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION alistore_guard_exchange_request_snapshot()
RETURNS trigger AS $$
BEGIN
  IF ROW(
    NEW.id, NEW."idempotencyKey", NEW."approvalId", NEW."requester", NEW."originalOrderId",
    NEW."oldImei", NEW."newProductId", NEW."newUnitId", NEW."newImei", NEW."creditAmount",
    NEW."surchargeAmount", NEW."method", NEW."shiftId", NEW."externalReference",
    NEW."expiresAt", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD."idempotencyKey", OLD."approvalId", OLD."requester", OLD."originalOrderId",
    OLD."oldImei", OLD."newProductId", OLD."newUnitId", OLD."newImei", OLD."creditAmount",
    OLD."surchargeAmount", OLD."method", OLD."shiftId", OLD."externalReference",
    OLD."expiresAt", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'ExchangeRequest snapshot is immutable';
  END IF;
  IF OLD.status <> 'requested' OR NEW.status NOT IN ('executed', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Invalid ExchangeRequest lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExchangeRequest_snapshot_guard"
BEFORE UPDATE ON "ExchangeRequest"
FOR EACH ROW EXECUTE FUNCTION alistore_guard_exchange_request_snapshot();
