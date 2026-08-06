-- Preserve a monotonic per-key generation when an override is reset.
ALTER TABLE "FeatureFlagOverride"
ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
