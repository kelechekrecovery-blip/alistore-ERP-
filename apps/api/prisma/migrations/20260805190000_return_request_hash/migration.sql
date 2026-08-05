ALTER TABLE "Return" ADD COLUMN "requestHash" TEXT;

-- Historical keyed rows predate a canonical request fingerprint. Their exact
-- original selection mode cannot be reconstructed, so make them explicitly
-- non-replayable instead of accepting an ambiguous payload.
UPDATE "Return"
SET "requestHash" = 'legacy-unreplayable:' || "id"
WHERE "idempotencyKey" IS NOT NULL;

ALTER TABLE "Return"
ADD CONSTRAINT "Return_keyed_request_hash_check"
CHECK ("idempotencyKey" IS NULL OR "requestHash" IS NOT NULL);
