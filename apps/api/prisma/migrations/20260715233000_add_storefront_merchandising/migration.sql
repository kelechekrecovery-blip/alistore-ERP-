ALTER TABLE "StorefrontContentRevision"
  ADD COLUMN "featuredTitle" TEXT NOT NULL DEFAULT 'Подборка AliStore',
  ADD COLUMN "featuredProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "scheduledBy" TEXT,
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3);

CREATE INDEX "StorefrontContentRevision_status_startsAt_endsAt_idx"
  ON "StorefrontContentRevision"("status", "startsAt", "endsAt");
