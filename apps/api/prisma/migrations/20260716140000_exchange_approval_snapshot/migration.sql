CREATE TABLE "ExchangeRequest" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "requester" TEXT NOT NULL,
  "originalOrderId" TEXT NOT NULL,
  "oldImei" TEXT NOT NULL,
  "newProductId" TEXT NOT NULL,
  "newImei" TEXT NOT NULL,
  "creditAmount" INTEGER NOT NULL,
  "surchargeAmount" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "shiftId" TEXT,
  "externalReference" TEXT,
  "exchangeOrderId" TEXT,
  "returnId" TEXT,
  "executedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExchangeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExchangeRequest_amounts_check" CHECK ("creditAmount" > 0 AND "surchargeAmount" >= 0),
  CONSTRAINT "ExchangeRequest_status_check" CHECK ("status" IN ('requested', 'executed', 'rejected')),
  CONSTRAINT "ExchangeRequest_resolution_check" CHECK (
    ("status" = 'requested' AND "exchangeOrderId" IS NULL AND "returnId" IS NULL AND "executedAt" IS NULL AND "rejectedAt" IS NULL)
    OR ("status" = 'executed' AND "exchangeOrderId" IS NOT NULL AND "returnId" IS NOT NULL AND "executedAt" IS NOT NULL AND "rejectedAt" IS NULL)
    OR ("status" = 'rejected' AND "exchangeOrderId" IS NULL AND "returnId" IS NULL AND "executedAt" IS NULL AND "rejectedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ExchangeRequest_idempotencyKey_key" ON "ExchangeRequest"("idempotencyKey");
CREATE UNIQUE INDEX "ExchangeRequest_approvalId_key" ON "ExchangeRequest"("approvalId");
CREATE UNIQUE INDEX "ExchangeRequest_exchangeOrderId_key" ON "ExchangeRequest"("exchangeOrderId");
CREATE UNIQUE INDEX "ExchangeRequest_returnId_key" ON "ExchangeRequest"("returnId");
CREATE INDEX "ExchangeRequest_status_createdAt_idx" ON "ExchangeRequest"("status", "createdAt");
CREATE INDEX "ExchangeRequest_originalOrderId_idx" ON "ExchangeRequest"("originalOrderId");
CREATE INDEX "ExchangeRequest_oldImei_idx" ON "ExchangeRequest"("oldImei");
CREATE INDEX "ExchangeRequest_newImei_idx" ON "ExchangeRequest"("newImei");

ALTER TABLE "ExchangeRequest"
  ADD CONSTRAINT "ExchangeRequest_approvalId_fkey"
  FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION alistore_guard_exchange_request_snapshot()
RETURNS trigger AS $$
BEGIN
  IF ROW(
    NEW."idempotencyKey", NEW."approvalId", NEW."requester", NEW."originalOrderId",
    NEW."oldImei", NEW."newProductId", NEW."newImei", NEW."creditAmount",
    NEW."surchargeAmount", NEW."method", NEW."shiftId", NEW."externalReference",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."idempotencyKey", OLD."approvalId", OLD."requester", OLD."originalOrderId",
    OLD."oldImei", OLD."newProductId", OLD."newImei", OLD."creditAmount",
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
