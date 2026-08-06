ALTER TABLE "SocialEnrollment"
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "appleClientId" TEXT,
  ADD COLUMN "appleGrantId" TEXT;

-- Existing consumed replay markers belong to an already-linked identity. Bind
-- them before the foreign key is installed, then remove copied provider PII.
UPDATE "SocialEnrollment" AS enrollment
SET "customerId" = identity."customerId"
FROM "CustomerIdentity" AS identity
WHERE enrollment."consumedAt" IS NOT NULL
  AND enrollment.provider = identity.provider
  AND enrollment.subject = identity.subject;

UPDATE "SocialEnrollment"
SET email = NULL, "displayName" = NULL, "avatarUrl" = NULL
WHERE "consumedAt" IS NOT NULL;

CREATE TABLE "AppleOAuthGrant" (
  "id" TEXT NOT NULL,
  "customerId" TEXT,
  "subject" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "refreshTokenEnvelope" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppleOAuthGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppleRevocationJob" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "refreshTokenEnvelope" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "claimToken" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppleRevocationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialEnrollment_appleGrantId_key"
  ON "SocialEnrollment"("appleGrantId");
CREATE INDEX "SocialEnrollment_customerId_idx"
  ON "SocialEnrollment"("customerId");
CREATE INDEX "AppleOAuthGrant_clientId_subject_idx"
  ON "AppleOAuthGrant"("clientId", "subject");
CREATE INDEX "AppleOAuthGrant_customerId_idx" ON "AppleOAuthGrant"("customerId");
CREATE INDEX "AppleRevocationJob_status_nextAttemptAt_idx"
  ON "AppleRevocationJob"("status", "nextAttemptAt");

ALTER TABLE "AppleOAuthGrant"
  ADD CONSTRAINT "AppleOAuthGrant_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialEnrollment"
  ADD CONSTRAINT "SocialEnrollment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
