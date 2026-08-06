BEGIN;

CREATE TYPE "OnlinePaymentIntentCommandStatus" AS ENUM (
  'queued',
  'creating',
  'creation_unknown',
  'requires_action',
  'cancel_pending',
  'cancelled',
  'creation_failed',
  'payment_failed',
  'paid',
  'expired',
  'manual_review'
);

ALTER TABLE "OnlinePaymentIntentCommand"
  ADD COLUMN "providerIdempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "gatewayMode" TEXT,
  ADD COLUMN "status" "OnlinePaymentIntentCommandStatus",
  ADD COLUMN "providerName" TEXT,
  ADD COLUMN "providerIntentId" TEXT,
  ADD COLUMN "providerTxnId" TEXT,
  ADD COLUMN "providerResult" JSONB,
  ADD COLUMN "providerResultHash" TEXT,
  ADD COLUMN "providerResultAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" TEXT,
  ADD COLUMN "lastErrorAt" TIMESTAMP(3),
  ADD COLUMN "customerRevokedAt" TIMESTAMP(3),
  ADD COLUMN "terminalAt" TIMESTAMP(3);

-- A command with no stored response may already have reached the provider. It is
-- deliberately quarantined instead of being made dispatchable by this migration.
UPDATE "OnlinePaymentIntentCommand"
SET
  "providerIdempotencyKey" = 'legacy:' || "id",
  "requestHash" = 'legacy-columns-v1:' || "id",
  "gatewayMode" = CASE WHEN "response" IS NULL THEN 'legacy-unknown' ELSE 'legacy' END,
  "status" = CASE WHEN "response" IS NULL
    THEN 'creation_unknown'::"OnlinePaymentIntentCommandStatus"
    ELSE 'manual_review'::"OnlinePaymentIntentCommandStatus"
  END,
  "providerName" = NULLIF("response" ->> 'provider', ''),
  "providerIntentId" = NULLIF("response" ->> 'intentId', ''),
  "providerTxnId" = NULLIF("response" ->> 'txnId', ''),
  "providerResult" = CASE WHEN "response" IS NULL THEN NULL ELSE jsonb_strip_nulls(jsonb_build_object(
    'provider', "response" ->> 'provider',
    'intentId', "response" ->> 'intentId',
    'txnId', "response" ->> 'txnId',
    'orderId', "response" ->> 'orderId',
    'method', "response" ->> 'method',
    'amount', "response" -> 'amount',
    'status', "response" ->> 'status',
    'expiresAt', "response" ->> 'expiresAt'
  )) END,
  "providerResultHash" = CASE WHEN "response" IS NULL THEN NULL ELSE 'legacy-unverified:' || "id" END,
  "providerResultAt" = CASE WHEN "response" IS NULL THEN NULL ELSE "updatedAt" END,
  "attempts" = CASE WHEN "response" IS NULL THEN 0 ELSE 1 END,
  "dispatchedAt" = CASE WHEN "response" IS NULL THEN NULL ELSE "updatedAt" END;

-- Accounts deleted before this migration must not regain a hosted-payment URL
-- merely because historical commands are being expanded into lifecycle rows.
UPDATE "OnlinePaymentIntentCommand" command
SET
  "status" = 'cancel_pending',
  "response" = NULL,
  "customerRevokedAt" = command."updatedAt"
WHERE EXISTS (
    SELECT 1
    FROM "Customer" customer
    WHERE customer.id = command."customerId"
      AND customer.phone LIKE 'deleted:%'
  )
  OR EXISTS (
    SELECT 1
    FROM "Order" owned_order
    JOIN "Customer" customer ON customer.id = owned_order."customerId"
    WHERE owned_order.id = command."orderId"
      AND customer.phone LIKE 'deleted:%'
  );

DO $$
DECLARE invalid_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM "OnlinePaymentIntentCommand"
  WHERE "amount" <= 0;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Cannot install online payment intent lifecycle constraints: % invalid row(s)',
      invalid_count;
  END IF;
END $$;

ALTER TABLE "OnlinePaymentIntentCommand"
  ALTER COLUMN "providerIdempotencyKey" SET NOT NULL,
  ALTER COLUMN "requestHash" SET NOT NULL,
  ALTER COLUMN "gatewayMode" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'queued',
  ALTER COLUMN "status" SET NOT NULL,
  ADD CONSTRAINT "OnlinePaymentIntentCommand_amount_positive_check"
    CHECK ("amount" > 0),
  ADD CONSTRAINT "OnlinePaymentIntentCommand_attempts_nonnegative_check"
    CHECK ("attempts" >= 0),
  ADD CONSTRAINT "OnlinePaymentIntentCommand_claim_lease_pair_check"
    CHECK (("claimToken" IS NULL) = ("leaseUntil" IS NULL)),
  ADD CONSTRAINT "OnlinePaymentIntentCommand_creating_claim_check"
    CHECK ("status" <> 'creating' OR ("claimToken" IS NOT NULL AND "leaseUntil" IS NOT NULL)),
  ADD CONSTRAINT "OnlinePaymentIntentCommand_queued_clean_check"
    CHECK (
      "status" <> 'queued'
      OR (
        "claimToken" IS NULL AND "leaseUntil" IS NULL AND "attempts" = 0
        AND "dispatchedAt" IS NULL AND "response" IS NULL AND "providerIntentId" IS NULL
      )
    ),
  ADD CONSTRAINT "OnlinePaymentIntentCommand_requires_action_evidence_check"
    CHECK (
      "status" <> 'requires_action'
      OR (
        "response" IS NOT NULL
        AND "providerName" IS NOT NULL
        AND "providerIntentId" IS NOT NULL
        AND "providerTxnId" IS NOT NULL
        AND "providerResult" IS NOT NULL
        AND "providerResultHash" IS NOT NULL
        AND "providerResultAt" IS NOT NULL
        AND "attempts" > 0
        AND "dispatchedAt" IS NOT NULL
      )
    );

CREATE UNIQUE INDEX "OnlinePaymentIntentCommand_providerIdempotencyKey_key"
  ON "OnlinePaymentIntentCommand"("providerIdempotencyKey");
CREATE UNIQUE INDEX "OnlinePaymentIntentCommand_live_provider_intent_key"
  ON "OnlinePaymentIntentCommand"("providerName", "providerIntentId")
  WHERE "gatewayMode" <> 'legacy' AND "gatewayMode" <> 'legacy-unknown';
CREATE UNIQUE INDEX "OnlinePaymentIntentCommand_live_provider_txn_key"
  ON "OnlinePaymentIntentCommand"("providerName", "providerTxnId")
  WHERE "gatewayMode" <> 'legacy' AND "gatewayMode" <> 'legacy-unknown';
CREATE INDEX "OnlinePaymentIntentCommand_providerName_providerIntentId_idx"
  ON "OnlinePaymentIntentCommand"("providerName", "providerIntentId");
CREATE INDEX "OnlinePaymentIntentCommand_providerName_providerTxnId_idx"
  ON "OnlinePaymentIntentCommand"("providerName", "providerTxnId");
CREATE INDEX "OnlinePaymentIntentCommand_orderId_status_idx"
  ON "OnlinePaymentIntentCommand"("orderId", "status");
CREATE INDEX "OnlinePaymentIntentCommand_status_nextAttemptAt_idx"
  ON "OnlinePaymentIntentCommand"("status", "nextAttemptAt");
CREATE INDEX "OnlinePaymentIntentCommand_status_leaseUntil_idx"
  ON "OnlinePaymentIntentCommand"("status", "leaseUntil");

DROP INDEX "OnlinePaymentIntentCommand_orderId_idx";

CREATE FUNCTION "prevent_online_payment_intent_evidence_overwrite"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."providerIdempotencyKey" IS DISTINCT FROM OLD."providerIdempotencyKey"
    OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
    OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
    OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
    OR NEW."method" IS DISTINCT FROM OLD."method"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."returnUrl" IS DISTINCT FROM OLD."returnUrl"
    OR NEW."gatewayMode" IS DISTINCT FROM OLD."gatewayMode"
    OR OLD."providerName" IS NOT NULL AND NEW."providerName" IS DISTINCT FROM OLD."providerName"
    OR OLD."providerIntentId" IS NOT NULL AND NEW."providerIntentId" IS DISTINCT FROM OLD."providerIntentId"
    OR OLD."providerTxnId" IS NOT NULL AND NEW."providerTxnId" IS DISTINCT FROM OLD."providerTxnId"
    OR OLD."providerResult" IS NOT NULL AND NEW."providerResult" IS DISTINCT FROM OLD."providerResult"
    OR OLD."providerResultHash" IS NOT NULL AND NEW."providerResultHash" IS DISTINCT FROM OLD."providerResultHash"
    OR OLD."providerResultAt" IS NOT NULL AND NEW."providerResultAt" IS DISTINCT FROM OLD."providerResultAt"
    OR OLD."expiresAt" IS NOT NULL AND NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR OLD."customerRevokedAt" IS NOT NULL AND NEW."customerRevokedAt" IS DISTINCT FROM OLD."customerRevokedAt"
    OR OLD."response" IS NOT NULL AND NEW."response" IS NOT NULL AND NEW."response" IS DISTINCT FROM OLD."response"
    OR OLD."response" IS NULL AND OLD."providerResultAt" IS NOT NULL AND NEW."response" IS NOT NULL
  THEN
    RAISE EXCEPTION 'Online payment intent request and provider evidence are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OnlinePaymentIntentCommand_evidence_immutable"
BEFORE UPDATE ON "OnlinePaymentIntentCommand"
FOR EACH ROW EXECUTE FUNCTION "prevent_online_payment_intent_evidence_overwrite"();

COMMIT;
