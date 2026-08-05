-- Tie customer-scoped authentication artifacts to their owner so account
-- deletion can remove proposed email PII and consumed provider identifiers.
ALTER TABLE "OtpChallenge" ADD COLUMN "customerId" TEXT;
ALTER TABLE "SocialEnrollment" ADD COLUMN "customerId" TEXT;

-- Pre-deployment attach challenges cannot be attributed reliably when their
-- proposed email differs from the account's current email. They are short-lived
-- credentials, so fail closed and require a fresh request after deploy.
DELETE FROM "OtpChallenge" WHERE purpose::text = 'email_attach';

-- Existing consumed replay markers can be linked through the provider identity.
-- Redact copied profile fields for every consumed marker, including rows whose
-- identity has already disappeared; hashes/provider subject remain for replay.
UPDATE "SocialEnrollment" AS enrollment
SET "customerId" = identity."customerId"
FROM "CustomerIdentity" AS identity
WHERE enrollment."consumedAt" IS NOT NULL
  AND enrollment.provider = identity.provider
  AND enrollment.subject = identity.subject;

UPDATE "SocialEnrollment"
SET email = NULL, "displayName" = NULL, "avatarUrl" = NULL
WHERE "consumedAt" IS NOT NULL;

CREATE INDEX "OtpChallenge_customerId_idx" ON "OtpChallenge"("customerId");
CREATE INDEX "SocialEnrollment_customerId_idx" ON "SocialEnrollment"("customerId");

ALTER TABLE "OtpChallenge"
  ADD CONSTRAINT "OtpChallenge_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialEnrollment"
  ADD CONSTRAINT "SocialEnrollment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
