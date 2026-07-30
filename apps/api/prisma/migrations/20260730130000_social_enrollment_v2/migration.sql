-- A verified provider identity is not an account until phone ownership is
-- proven. Persist only hashes of the opaque enrollment token and provider
-- assertion; raw Apple/Telegram credentials must never reach this table.
CREATE TABLE "SocialEnrollment" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "assertionHash" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT,
  "displayName" TEXT,
  "avatarUrl" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SocialEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialEnrollment_tokenHash_key"
ON "SocialEnrollment"("tokenHash");

CREATE UNIQUE INDEX "SocialEnrollment_assertionHash_key"
ON "SocialEnrollment"("assertionHash");

CREATE INDEX "SocialEnrollment_provider_subject_idx"
ON "SocialEnrollment"("provider", "subject");

CREATE INDEX "SocialEnrollment_expiresAt_idx"
ON "SocialEnrollment"("expiresAt");
