-- Additive and populated-data safe: existing deployments receive one empty
-- override table. Absence of a row preserves the legacy environment/default
-- evaluation path, so application rollback remains compatible.
CREATE TABLE "FeatureFlagOverride" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "FeatureFlagOverride_updatedAt_idx"
    ON "FeatureFlagOverride"("updatedAt");
