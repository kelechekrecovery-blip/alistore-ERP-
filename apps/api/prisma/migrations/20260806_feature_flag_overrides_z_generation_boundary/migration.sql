-- Keep concurrency generations independently from active override rows so
-- rolling previous images continue to interpret row presence correctly.
CREATE TABLE IF NOT EXISTS "FeatureFlagGeneration" (
  "key" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeatureFlagGeneration_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "FeatureFlagGeneration_revision_positive" CHECK ("revision" >= 1)
);

-- Preserve both active override revisions and inactive tombstone generations.
INSERT INTO "FeatureFlagGeneration" ("key", "revision", "updatedAt")
SELECT "key", "revision", CURRENT_TIMESTAMP
FROM "FeatureFlagOverride"
ON CONFLICT ("key") DO UPDATE
SET "revision" = GREATEST(
  "FeatureFlagGeneration"."revision",
  EXCLUDED."revision"
),
"updatedAt" = CURRENT_TIMESTAMP;

-- From this point forward, row presence means an active override for every image.
DELETE FROM "FeatureFlagOverride" WHERE "active" = false;

CREATE OR REPLACE FUNCTION "advanceFeatureFlagGeneration"()
RETURNS TRIGGER AS $$
DECLARE
  generation_key TEXT;
  next_revision INTEGER;
BEGIN
  generation_key := CASE WHEN TG_OP = 'DELETE' THEN OLD."key" ELSE NEW."key" END;

  INSERT INTO "FeatureFlagGeneration" AS generation ("key", "revision", "updatedAt")
  VALUES (generation_key, 1, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO UPDATE
  SET "revision" = generation."revision" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "revision" INTO next_revision;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Keep the legacy override revision synchronized for previous-image OCC.
  NEW."revision" := next_revision;
  NEW."active" := true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FeatureFlagOverride_advance_generation" ON "FeatureFlagOverride";
CREATE TRIGGER "FeatureFlagOverride_advance_generation"
BEFORE INSERT OR UPDATE OR DELETE ON "FeatureFlagOverride"
FOR EACH ROW EXECUTE FUNCTION "advanceFeatureFlagGeneration"();
