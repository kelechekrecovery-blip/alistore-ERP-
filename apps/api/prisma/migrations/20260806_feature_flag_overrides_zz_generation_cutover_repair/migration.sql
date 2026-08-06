BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE "FeatureFlagOverride" IN ACCESS EXCLUSIVE MODE;

-- This forward repair is intentionally separate from the already-recorded
-- generation migration. ACCESS EXCLUSIVE is the first table lock: the deploy
-- either establishes the complete cutover barrier within five seconds or fails
-- operationally without entering a lock-upgrade cycle. Ordinary reads resume
-- after commit; old application images are not mutation-compatible afterward.

-- The recorded trigger could turn an immediately preceding image's
-- active=false reset into a surviving active=true row. AuditEvent.ts is a
-- transaction-start timestamp and AuditEvent.id is not a commit sequence, so
-- neither may be used to choose a "latest" intent. Instead, bind evidence to
-- the current row's own atomic mutation fingerprint (key, reason, actor): a
-- surviving active row is safe only when that fingerprint has database intent
-- and no fallback intent. Missing or conflicting evidence requires an explicit
-- operator PATCH or DELETE through the current API before retrying this deploy.
DO $reconciliation$
DECLARE
  unsafe_rows TEXT;
BEGIN
  WITH row_evidence AS (
    SELECT
      override."key",
      override."revision" AS row_revision,
      generation."revision" AS generation_revision,
      override."reason",
      override."updatedBy",
      COUNT(event.id) FILTER (
        WHERE event.payload->'after'->>'source' = 'database'
      ) AS database_matches,
      COUNT(event.id) FILTER (
        WHERE event.payload->'after'->>'source' IN ('environment', 'default')
      ) AS fallback_matches,
      COUNT(event.id) FILTER (
        WHERE event.payload->'after'->>'source' IS NULL
           OR event.payload->'after'->>'source' NOT IN ('database', 'environment', 'default')
      ) AS unknown_matches,
      COALESCE(
        array_to_string(array_agg(event.id) FILTER (WHERE event.id IS NOT NULL), ','),
        'none'
      ) AS event_ids
    FROM "FeatureFlagOverride" AS override
    LEFT JOIN "FeatureFlagGeneration" AS generation
      ON generation."key" = override."key"
    LEFT JOIN "AuditEvent" AS event
      ON event.type = 'feature_flag.changed'
     AND event.payload->>'key' = override."key"
     AND event.payload->>'reason' = override."reason"
     AND event.actor = override."updatedBy"
     AND event.refs @> ARRAY[override."key"]::TEXT[]
    WHERE override."active" = true
    GROUP BY
      override."key",
      override."revision",
      generation."revision",
      override."reason",
      override."updatedBy"
  )
  SELECT string_agg(
    format(
      '%s(row=%s,generation=%s,reason=%L,actor=%L,database=%s,fallback=%s,unknown=%s,events=%s)',
      row_evidence."key",
      row_evidence.row_revision,
      row_evidence.generation_revision,
      row_evidence."reason",
      row_evidence."updatedBy",
      row_evidence.database_matches,
      row_evidence.fallback_matches,
      row_evidence.unknown_matches,
      row_evidence.event_ids
    ),
    ', ' ORDER BY row_evidence."key"
  )
  INTO unsafe_rows
  FROM row_evidence
  WHERE row_evidence.database_matches = 0
     OR row_evidence.fallback_matches > 0
     OR row_evidence.unknown_matches > 0;

  IF unsafe_rows IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Feature flag cutover requires explicit operator reconciliation',
      DETAIL = 'Unsafe current rows: ' || unsafe_rows,
      HINT = 'Stop old mutators. Choose fallback by DELETE or active DB state by audited PATCH through the current API with a new unique reason; then run prisma migrate resolve --rolled-back 20260806_feature_flag_overrides_zz_generation_cutover_repair and rerun prisma migrate deploy.';
  END IF;
END;
$reconciliation$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FeatureFlagOverride_advance_generation" ON "FeatureFlagOverride";
DROP TRIGGER IF EXISTS "FeatureFlagOverride_prepare_revision" ON "FeatureFlagOverride";
DROP TRIGGER IF EXISTS "FeatureFlagOverride_finish_mutation" ON "FeatureFlagOverride";
DROP TRIGGER IF EXISTS "FeatureFlagOverride_00_require_current_image" ON "FeatureFlagOverride";
DROP TRIGGER IF EXISTS "FeatureFlagOverride_10_prepare_revision" ON "FeatureFlagOverride";
DROP TRIGGER IF EXISTS "FeatureFlagOverride_20_finish_mutation" ON "FeatureFlagOverride";

-- Fence every allowlisted key above the durable generation and any surviving
-- row revision. Once the marker trigger is installed, old images cannot use
-- missing-row expectedRevision:null to cross this boundary.
WITH registry_keys ("key") AS (
  VALUES
    ('supply.to_order_checkout'),
    ('supply.cancellation'),
    ('supply.auto_refund'),
    ('supply.owner_resolution'),
    ('supply.partial_handover'),
    ('supply.quarantine_conversion')
), evidence AS (
  SELECT
    registry_keys."key",
    COALESCE(generation."revision", 0) AS generation_revision,
    COALESCE(override."revision", 0) AS override_revision
  FROM registry_keys
  LEFT JOIN "FeatureFlagGeneration" AS generation
    ON generation."key" = registry_keys."key"
  LEFT JOIN "FeatureFlagOverride" AS override
    ON override."key" = registry_keys."key"
)
INSERT INTO "FeatureFlagGeneration" AS generation ("key", "revision", "updatedAt")
SELECT
  evidence."key",
  GREATEST(evidence.generation_revision, evidence.override_revision) + 1,
  CURRENT_TIMESTAMP
FROM evidence
ON CONFLICT ("key") DO UPDATE
SET "revision" = GREATEST(generation."revision", EXCLUDED."revision"),
    "updatedAt" = CURRENT_TIMESTAMP;

-- An inactive row is unambiguous tombstone state. Active rows were either
-- proven above or caused the migration to abort; never infer intent ordering.
DELETE FROM "FeatureFlagOverride" WHERE "active" = false;

UPDATE "FeatureFlagOverride" AS override
SET "revision" = generation."revision",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "FeatureFlagGeneration" AS generation
WHERE generation."key" = override."key";

CREATE OR REPLACE FUNCTION "requireCurrentFeatureFlagMutationImage"()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('alistore.feature_flag_mutation_contract', true)
       IS DISTINCT FROM 'generation-v2' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Feature flag mutation rejected: current application image required',
      DETAIL = format('Unmarked %s attempted on FeatureFlagOverride.', TG_OP),
      HINT = 'Drain old feature-flag mutators, deploy the current API image, and retry the control-plane mutation.';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- INSERT ... ON CONFLICT DO UPDATE executes both BEFORE paths. Revision
-- preparation is therefore side-effect free; the one actual AFTER path advances
-- the durable clock. The service advisory lock remains the application OCC
-- serialization point; the AFTER invariant fails any bypass race closed.
CREATE OR REPLACE FUNCTION "prepareFeatureFlagOverrideRevision"()
RETURNS TRIGGER AS $$
DECLARE
  current_revision INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."key" IS DISTINCT FROM OLD."key" THEN
    RAISE EXCEPTION 'FeatureFlagOverride.key is immutable';
  END IF;

  IF NEW."active" IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'FeatureFlagOverride.active=false is no longer a mutation contract',
      HINT = 'Use DELETE through the current feature-flag API to restore deployment fallback.';
  END IF;

  SELECT generation."revision"
  INTO current_revision
  FROM "FeatureFlagGeneration" AS generation
  WHERE generation."key" = NEW."key";

  NEW."revision" := COALESCE(current_revision + 1, 1);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "finishFeatureFlagOverrideMutation"()
RETURNS TRIGGER AS $$
DECLARE
  generation_key TEXT;
  expected_revision INTEGER;
  actual_revision INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    generation_key := OLD."key";
    expected_revision := OLD."revision" + 1;
  ELSE
    generation_key := NEW."key";
    expected_revision := NEW."revision";
  END IF;

  INSERT INTO "FeatureFlagGeneration" AS generation ("key", "revision", "updatedAt")
  VALUES (generation_key, expected_revision, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO UPDATE
  SET "revision" = generation."revision" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "revision" INTO actual_revision;

  IF actual_revision <> expected_revision THEN
    RAISE EXCEPTION
      'Feature flag generation invariant failed for %, expected %, got %',
      generation_key, expected_revision, actual_revision;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- A statement guard fires even for a zero-row UPDATE/DELETE and precedes the
-- row-level revision preparation on INSERT/UPDATE.
CREATE TRIGGER "FeatureFlagOverride_00_require_current_image"
BEFORE INSERT OR UPDATE OR DELETE ON "FeatureFlagOverride"
FOR EACH STATEMENT EXECUTE FUNCTION "requireCurrentFeatureFlagMutationImage"();

CREATE TRIGGER "FeatureFlagOverride_10_prepare_revision"
BEFORE INSERT OR UPDATE ON "FeatureFlagOverride"
FOR EACH ROW EXECUTE FUNCTION "prepareFeatureFlagOverrideRevision"();

CREATE TRIGGER "FeatureFlagOverride_20_finish_mutation"
AFTER INSERT OR UPDATE OR DELETE ON "FeatureFlagOverride"
FOR EACH ROW EXECUTE FUNCTION "finishFeatureFlagOverrideMutation"();

DROP FUNCTION IF EXISTS "advanceFeatureFlagGeneration"();

COMMIT;
