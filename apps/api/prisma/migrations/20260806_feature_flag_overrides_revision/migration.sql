-- Additive optimistic-concurrency token for owner feature-flag mutations.
ALTER TABLE "FeatureFlagOverride"
ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;
