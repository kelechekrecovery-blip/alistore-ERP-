ALTER TABLE "EvidenceUpload"
  ADD COLUMN "isPii" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "retentionUntil" TIMESTAMP(3),
  ADD COLUMN "purgeRequestedAt" TIMESTAMP(3),
  ADD COLUMN "purgeAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextPurgeAt" TIMESTAMP(3),
  ADD COLUMN "purgedAt" TIMESTAMP(3),
  ADD COLUMN "purgeReason" TEXT;

CREATE INDEX "EvidenceUpload_isPii_purgedAt_retentionUntil_nextPurgeAt_idx"
  ON "EvidenceUpload"("isPii", "purgedAt", "retentionUntil", "nextPurgeAt");
