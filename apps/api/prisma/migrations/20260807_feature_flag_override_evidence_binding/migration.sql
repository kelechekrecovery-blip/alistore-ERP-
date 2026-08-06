BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE "FeatureFlagOverride" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "FeatureFlagGeneration" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "AuditEvent" IN SHARE ROW EXCLUSIVE MODE;

-- This verifier is intentionally forward-only. The preceding cutover repair may
-- already be recorded in deployed databases, so changing it would neither repair
-- those databases nor preserve Prisma checksums. Disable only the three known
-- mutation triggers while this ACCESS EXCLUSIVE transaction adds and backfills
-- the binding; do not change any unrelated trigger's operator-managed state.
ALTER TABLE "FeatureFlagOverride"
  DISABLE TRIGGER "FeatureFlagOverride_00_require_current_image";
ALTER TABLE "FeatureFlagOverride"
  DISABLE TRIGGER "FeatureFlagOverride_10_prepare_revision";
ALTER TABLE "FeatureFlagOverride"
  DISABLE TRIGGER "FeatureFlagOverride_20_finish_mutation";

ALTER TABLE "FeatureFlagOverride"
  ADD COLUMN "evidenceEventId" TEXT,
  ADD COLUMN "evidenceRevision" INTEGER,
  ADD COLUMN "evidenceVersion" SMALLINT;

ALTER TABLE "FeatureFlagGeneration"
  ADD COLUMN "evidenceEventId" TEXT,
  ADD COLUMN "evidenceRevision" INTEGER,
  ADD COLUMN "evidenceAction" TEXT;

-- A current row is accepted only when its own key/reason/actor fingerprint has
-- exactly one AuditEvent and that event proves the exact boolean database state.
-- Missing, malformed, opposite, duplicate, or mixed evidence is never ordered by
-- timestamp/id and never guessed; the operator must write a new unique intent.
DO $verify_existing_evidence$
DECLARE
  unsafe_rows TEXT;
BEGIN
  WITH evidence AS (
    SELECT
      current_override."key",
      current_override."enabled",
      current_override."revision",
      COUNT(event.id) AS fingerprint_count,
      COUNT(event.id) FILTER (
        WHERE jsonb_typeof(event.payload->'after') = 'object'
          AND jsonb_typeof(event.payload->'after'->'source') = 'string'
          AND event.payload->'after'->>'source' = 'database'
          AND CASE
            WHEN jsonb_typeof(event.payload->'after'->'enabled') = 'boolean'
              THEN (event.payload->'after'->>'enabled')::BOOLEAN = current_override."enabled"
            ELSE false
          END
      ) AS exact_count,
      COUNT(event.id) FILTER (
        WHERE jsonb_typeof(event.payload->'after'->'enabled') IS DISTINCT FROM 'boolean'
      ) AS malformed_count,
      COUNT(event.id) FILTER (
        WHERE jsonb_typeof(event.payload->'after'->'enabled') = 'boolean'
          AND (event.payload->'after'->>'enabled')::BOOLEAN <> current_override."enabled"
      ) AS opposite_count,
      MIN(event.id) FILTER (
        WHERE jsonb_typeof(event.payload->'after') = 'object'
          AND jsonb_typeof(event.payload->'after'->'source') = 'string'
          AND event.payload->'after'->>'source' = 'database'
          AND CASE
            WHEN jsonb_typeof(event.payload->'after'->'enabled') = 'boolean'
              THEN (event.payload->'after'->>'enabled')::BOOLEAN = current_override."enabled"
            ELSE false
          END
      ) AS exact_event_id
    FROM "FeatureFlagOverride" AS current_override
    LEFT JOIN "AuditEvent" AS event
      ON event.type = 'feature_flag.changed'
     AND event.payload->>'key' = current_override."key"
     AND event.payload->>'reason' = current_override."reason"
     AND event.actor = current_override."updatedBy"
     AND event.refs = ARRAY[current_override."key"]::TEXT[]
    GROUP BY
      current_override."key",
      current_override."enabled",
      current_override."revision"
  )
  SELECT string_agg(
    format(
      '%s(revision=%s,fingerprint=%s,exact=%s,malformed=%s,opposite=%s)',
      evidence."key",
      evidence."revision",
      evidence.fingerprint_count,
      evidence.exact_count,
      evidence.malformed_count,
      evidence.opposite_count
    ),
    ', ' ORDER BY evidence."key"
  )
  INTO unsafe_rows
  FROM evidence
  WHERE evidence.fingerprint_count <> 1
     OR evidence.exact_count <> 1;

  IF unsafe_rows IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Feature flag evidence binding requires explicit operator reconciliation',
      DETAIL = 'Unsafe current overrides: ' || unsafe_rows,
      HINT = 'Keep legacy mutators drained. Use the currently deployed feature-flag API with a new unique reason, then resolve this migration as rolled back and rerun prisma migrate deploy.';
  END IF;

  WITH exact_evidence AS (
    SELECT
      current_override."key",
      current_override."revision",
      event.id
    FROM "FeatureFlagOverride" AS current_override
    JOIN "AuditEvent" AS event
      ON event.type = 'feature_flag.changed'
     AND event.payload->>'key' = current_override."key"
     AND event.payload->>'reason' = current_override."reason"
     AND event.actor = current_override."updatedBy"
     AND event.refs = ARRAY[current_override."key"]::TEXT[]
     AND jsonb_typeof(event.payload->'after') = 'object'
     AND jsonb_typeof(event.payload->'after'->'source') = 'string'
     AND event.payload->'after'->>'source' = 'database'
     AND CASE
       WHEN jsonb_typeof(event.payload->'after'->'enabled') = 'boolean'
         THEN (event.payload->'after'->>'enabled')::BOOLEAN = current_override."enabled"
       ELSE false
     END
  )
  UPDATE "FeatureFlagOverride" AS current_override
  SET "evidenceEventId" = exact_evidence.id,
      "evidenceRevision" = exact_evidence."revision",
      "evidenceVersion" = 1
  FROM exact_evidence
  WHERE exact_evidence."key" = current_override."key";
END;
$verify_existing_evidence$ LANGUAGE plpgsql;

-- The durable generation becomes the evidence anchor when no override row
-- exists after reset. Existing active generations inherit the exact binding;
-- historical row-absent generations remain nullable until their next mutation.
UPDATE "FeatureFlagGeneration" AS generation
SET "evidenceEventId" = override."evidenceEventId",
    "evidenceRevision" = override."evidenceRevision",
    "evidenceAction" = 'set'
FROM "FeatureFlagOverride" AS override
WHERE override."key" = generation."key";

ALTER TABLE "FeatureFlagOverride"
  ALTER COLUMN "evidenceEventId" SET NOT NULL,
  ALTER COLUMN "evidenceRevision" SET NOT NULL,
  ALTER COLUMN "evidenceVersion" SET NOT NULL,
  ALTER COLUMN "evidenceVersion" SET DEFAULT 2,
  ADD CONSTRAINT "FeatureFlagOverride_evidenceRevision_check"
    CHECK ("evidenceRevision" > 0),
  ADD CONSTRAINT "FeatureFlagOverride_evidenceVersion_check"
    CHECK ("evidenceVersion" IN (1, 2));

CREATE UNIQUE INDEX "FeatureFlagOverride_evidenceEventId_key"
  ON "FeatureFlagOverride"("evidenceEventId");

ALTER TABLE "FeatureFlagGeneration"
  ADD CONSTRAINT "FeatureFlagGeneration_evidence_check"
  CHECK (
    ("evidenceEventId" IS NULL AND "evidenceRevision" IS NULL AND "evidenceAction" IS NULL)
    OR (
      "evidenceEventId" IS NOT NULL
      AND "evidenceRevision" IS NOT NULL
      AND "evidenceRevision" > 0
      AND "evidenceAction" IS NOT NULL
      AND "evidenceAction" IN ('set', 'reset')
    )
  );

CREATE UNIQUE INDEX "FeatureFlagGeneration_evidenceEventId_key"
  ON "FeatureFlagGeneration"("evidenceEventId");

-- The event may be inserted after the override/generation write in the same
-- transaction, so both references are deferred. RESTRICT keeps committed
-- evidence durable once either anchor points at it.
ALTER TABLE "FeatureFlagOverride"
  ADD CONSTRAINT "FeatureFlagOverride_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "AuditEvent"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "FeatureFlagGeneration"
  ADD CONSTRAINT "FeatureFlagGeneration_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "AuditEvent"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

-- Consumption is permanent even after a later mutation moves both current-state
-- anchors to a new event. Its two uniqueness constraints make an event and a
-- key/revision pair single-use.
CREATE TABLE "FeatureFlagEvidenceConsumption" (
  "eventId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "version" SMALLINT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeatureFlagEvidenceConsumption_pkey" PRIMARY KEY ("eventId"),
  CONSTRAINT "FeatureFlagEvidenceConsumption_key_revision_key" UNIQUE ("key", "revision"),
  CONSTRAINT "FeatureFlagEvidenceConsumption_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "FeatureFlagEvidenceConsumption_action_check" CHECK ("action" IN ('set', 'reset')),
  CONSTRAINT "FeatureFlagEvidenceConsumption_version_check" CHECK ("version" IN (1, 2)),
  CONSTRAINT "FeatureFlagEvidenceConsumption_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "AuditEvent"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX "FeatureFlagEvidenceConsumption_key_createdAt_idx"
  ON "FeatureFlagEvidenceConsumption"("key", "createdAt");

INSERT INTO "FeatureFlagEvidenceConsumption" (
  "eventId", "key", "revision", "action", "version", "transactionId"
)
SELECT
  override."evidenceEventId", override."key", override."evidenceRevision", 'set', 1,
  event.xmin::TEXT
FROM "FeatureFlagOverride" AS override
JOIN "AuditEvent" AS event ON event.id = override."evidenceEventId";

CREATE OR REPLACE FUNCTION "guardFeatureFlagEvidenceConsumptionRows"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND pg_trigger_depth() = 2
     AND NEW."transactionId" = (pg_current_xact_id()::xid)::TEXT THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'Feature flag evidence consumption is append-only and trigger-owned';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FeatureFlagEvidenceConsumption_00_guard_rows"
BEFORE INSERT OR UPDATE OR DELETE ON "FeatureFlagEvidenceConsumption"
FOR EACH ROW EXECUTE FUNCTION "guardFeatureFlagEvidenceConsumptionRows"();

CREATE OR REPLACE FUNCTION "preventFeatureFlagEvidenceConsumptionTruncate"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'Feature flag evidence consumption cannot be truncated';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FeatureFlagEvidenceConsumption_00_prevent_truncate"
BEFORE TRUNCATE ON "FeatureFlagEvidenceConsumption"
FOR EACH STATEMENT EXECUTE FUNCTION "preventFeatureFlagEvidenceConsumptionTruncate"();

CREATE OR REPLACE FUNCTION "requireFeatureFlagEvidenceConsumption"()
RETURNS TRIGGER AS $$
DECLARE
  exact_claims INTEGER;
BEGIN
  IF NEW.type <> 'feature_flag.changed' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO exact_claims
  FROM "FeatureFlagEvidenceConsumption" AS consumption
  WHERE consumption."eventId" = NEW.id
    AND consumption."version" = 2
    AND consumption."transactionId" = (pg_current_xact_id()::xid)::TEXT;

  IF exact_claims <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Feature flag audit evidence must be claimed by its mutation transaction',
      DETAIL = format('event=%s', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_10_require_feature_flag_consumption"
BEFORE INSERT ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION "requireFeatureFlagEvidenceConsumption"();

-- The generation is the durable OCC/ABA clock, including while no override row
-- exists. Ordinary application SQL must never delete or truncate that clock.
CREATE OR REPLACE FUNCTION "preventFeatureFlagGenerationDestruction"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'Feature flag generation is append-preserving and cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FeatureFlagGeneration_00_prevent_destruction"
BEFORE DELETE OR TRUNCATE ON "FeatureFlagGeneration"
FOR EACH STATEMENT EXECUTE FUNCTION "preventFeatureFlagGenerationDestruction"();

-- A feature-flag event is immutable from insertion onward, not only while it is
-- the current anchor. Permanent consumption also protects an event if its type
-- was somehow changed before this migration. Unrelated events retain their
-- existing database behavior.
CREATE OR REPLACE FUNCTION "protectFeatureFlagEvidenceAuditEvent"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.type = 'feature_flag.changed'
     OR (TG_OP = 'UPDATE' AND NEW.type = 'feature_flag.changed')
     OR EXISTS (
       SELECT 1 FROM "FeatureFlagEvidenceConsumption" AS consumption
       WHERE consumption."eventId" = OLD.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Feature flag audit evidence is append-only and immutable',
      DETAIL = format('event=%s', OLD.id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_90_protect_feature_flag_evidence"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION "protectFeatureFlagEvidenceAuditEvent"();

-- TRUNCATE does not fire the recorded INSERT/UPDATE/DELETE statement guard and
-- would remove every active override without advancing its durable generation.
CREATE OR REPLACE FUNCTION "preventFeatureFlagOverrideTruncate"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'Feature flag overrides cannot be truncated';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FeatureFlagOverride_00_prevent_truncate"
BEFORE TRUNCATE ON "FeatureFlagOverride"
FOR EACH STATEMENT EXECUTE FUNCTION "preventFeatureFlagOverrideTruncate"();

-- The generation clock is implementation-owned. A current override mutation
-- invokes finishFeatureFlagOverrideMutation at trigger depth 1, and its nested
-- generation upsert reaches this guard at depth 2. A top-level INSERT/UPDATE,
-- even with a caller-fabricated event and mutation marker, is rejected.
CREATE OR REPLACE FUNCTION "requireFeatureFlagGenerationWriter"()
RETURNS TRIGGER AS $$
DECLARE
  existing_revision INTEGER;
BEGIN
  IF pg_trigger_depth() <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Feature flag generation may advance only from the override mutation trigger';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."key" IS DISTINCT FROM OLD."key"
       OR NEW."revision" <> OLD."revision" + 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Feature flag generation must advance exactly once for the same key';
    END IF;
  ELSE
    SELECT generation."revision"
    INTO existing_revision
    FROM "FeatureFlagGeneration" AS generation
    WHERE generation."key" = NEW."key";

    IF existing_revision IS NULL AND NEW."revision" <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'A new feature flag generation must start at revision 1';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FeatureFlagGeneration_10_require_override_writer"
BEFORE INSERT OR UPDATE ON "FeatureFlagGeneration"
FOR EACH ROW EXECUTE FUNCTION "requireFeatureFlagGenerationWriter"();

CREATE OR REPLACE FUNCTION "requireCurrentFeatureFlagEvidenceVersion"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."evidenceVersion" <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Legacy feature flag evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FeatureFlagOverride_15_require_v2_evidence"
BEFORE INSERT OR UPDATE ON "FeatureFlagOverride"
FOR EACH ROW EXECUTE FUNCTION "requireCurrentFeatureFlagEvidenceVersion"();

-- Extend the already-recorded generation trigger forward. INSERT/UPDATE takes
-- its event binding from the row; DELETE requires a transaction-local mutation
-- ID which is later proven by the deferred generation constraint.
CREATE OR REPLACE FUNCTION "finishFeatureFlagOverrideMutation"()
RETURNS TRIGGER AS $$
DECLARE
  generation_key TEXT;
  expected_revision INTEGER;
  actual_revision INTEGER;
  mutation_id TEXT;
  mutation_action TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    generation_key := OLD."key";
    expected_revision := OLD."revision" + 1;
    mutation_id := current_setting('alistore.feature_flag_mutation_id', true);
    mutation_action := 'reset';
    IF mutation_id IS NULL OR mutation_id = '' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Feature flag reset mutation ID is required';
    END IF;
  ELSE
    generation_key := NEW."key";
    expected_revision := NEW."revision";
    mutation_id := NEW."evidenceEventId";
    mutation_action := 'set';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AuditEvent" AS event
    WHERE event.id = mutation_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Feature flag evidence must be inserted by the mutation transaction',
      DETAIL = format('event=%s already exists', mutation_id);
  END IF;

  INSERT INTO "FeatureFlagEvidenceConsumption" (
    "eventId", "key", "revision", "action", "version", "transactionId"
  ) VALUES (
    mutation_id, generation_key, expected_revision, mutation_action, 2,
    (pg_current_xact_id()::xid)::TEXT
  );

  INSERT INTO "FeatureFlagGeneration" AS generation (
    "key", "revision", "evidenceEventId", "evidenceRevision", "evidenceAction", "updatedAt"
  )
  VALUES (
    generation_key, expected_revision, mutation_id, expected_revision,
    mutation_action, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("key") DO UPDATE
  SET "revision" = generation."revision" + 1,
      "evidenceEventId" = EXCLUDED."evidenceEventId",
      "evidenceRevision" = EXCLUDED."evidenceRevision",
      "evidenceAction" = EXCLUDED."evidenceAction",
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

CREATE OR REPLACE FUNCTION "verifyFeatureFlagOverrideEvidence"()
RETURNS TRIGGER AS $$
DECLARE
  exact_matches INTEGER;
BEGIN
  -- Version 1 exists only for rows backfilled above while this verifier was not
  -- installed. Every post-cutover write must carry the non-replayable v2 event.
  IF NEW."evidenceVersion" <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Legacy feature flag evidence is immutable';
  END IF;

  IF NEW."evidenceRevision" <> NEW."revision" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Feature flag evidence revision does not match current revision';
  END IF;

  SELECT COUNT(*)
  INTO exact_matches
  FROM "AuditEvent" AS event
  JOIN "FeatureFlagEvidenceConsumption" AS consumption
    ON consumption."eventId" = event.id
   AND consumption."key" = NEW."key"
   AND consumption."revision" = NEW."revision"
   AND consumption."action" = 'set'
   AND consumption."version" = 2
   AND event.xmin::TEXT = consumption."transactionId"
  WHERE event.id = NEW."evidenceEventId"
    AND event.type = 'feature_flag.changed'
    AND event.actor = NEW."updatedBy"
    AND event.refs = ARRAY[NEW."key"]::TEXT[]
    AND event.payload->>'key' = NEW."key"
    AND event.payload->>'reason' = NEW."reason"
    AND jsonb_typeof(event.payload->'after') = 'object'
    AND jsonb_typeof(event.payload->'after'->'source') = 'string'
    AND event.payload->'after'->>'source' = 'database'
    AND CASE
      WHEN jsonb_typeof(event.payload->'after'->'enabled') = 'boolean'
        THEN (event.payload->'after'->>'enabled')::BOOLEAN = NEW."enabled"
      ELSE false
    END
    AND jsonb_typeof(event.payload->'mutationId') = 'string'
    AND event.payload->>'mutationId' = NEW."evidenceEventId"
    AND CASE
      WHEN jsonb_typeof(event.payload->'revision') = 'number'
        AND event.payload->>'revision' ~ '^[1-9][0-9]*$'
        THEN (event.payload->>'revision')::NUMERIC = NEW."evidenceRevision"
      ELSE false
    END;

  IF exact_matches <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Feature flag override lacks exact bound audit evidence',
      DETAIL = format('key=%s revision=%s evidence=%s', NEW."key", NEW."revision", NEW."evidenceEventId");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "FeatureFlagOverride_90_verify_evidence"
AFTER INSERT OR UPDATE ON "FeatureFlagOverride"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "verifyFeatureFlagOverrideEvidence"();

CREATE OR REPLACE FUNCTION "verifyFeatureFlagGenerationEvidence"()
RETURNS TRIGGER AS $$
DECLARE
  exact_matches INTEGER;
BEGIN
  IF NEW."evidenceEventId" IS NULL
     OR NEW."evidenceRevision" IS DISTINCT FROM NEW."revision" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Feature flag generation lacks current mutation evidence';
  END IF;

  SELECT COUNT(*)
  INTO exact_matches
  FROM "AuditEvent" AS event
  JOIN "FeatureFlagEvidenceConsumption" AS consumption
    ON consumption."eventId" = event.id
   AND consumption."key" = NEW."key"
   AND consumption."revision" = NEW."revision"
   AND consumption."action" = NEW."evidenceAction"
   AND consumption."version" = 2
   AND event.xmin::TEXT = consumption."transactionId"
  WHERE event.id = NEW."evidenceEventId"
    AND event.type = 'feature_flag.changed'
    AND event.actor <> ''
    AND event.refs = ARRAY[NEW."key"]::TEXT[]
    AND event.payload->>'key' = NEW."key"
    AND jsonb_typeof(event.payload->'reason') = 'string'
    AND event.payload->>'reason' <> ''
    AND jsonb_typeof(event.payload->'mutationId') = 'string'
    AND event.payload->>'mutationId' = NEW."evidenceEventId"
    AND CASE
      WHEN jsonb_typeof(event.payload->'revision') = 'number'
        AND event.payload->>'revision' ~ '^[1-9][0-9]*$'
        THEN (event.payload->>'revision')::NUMERIC = NEW."revision"
      ELSE false
    END
    AND jsonb_typeof(event.payload->'after') = 'object'
    AND jsonb_typeof(event.payload->'after'->'enabled') = 'boolean'
    AND (
      (
        NEW."evidenceAction" = 'set'
        AND event.payload->'after'->>'source' = 'database'
        AND EXISTS (
          SELECT 1 FROM "FeatureFlagOverride" AS override
          WHERE override."key" = NEW."key"
            AND override."evidenceEventId" = NEW."evidenceEventId"
        )
      )
      OR (
        NEW."evidenceAction" = 'reset'
        AND event.payload->'after'->>'source' IN ('environment', 'default')
        AND NOT EXISTS (
          SELECT 1 FROM "FeatureFlagOverride" AS override
          WHERE override."key" = NEW."key"
        )
      )
    );

  IF exact_matches <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Feature flag generation lacks exact bound audit evidence',
      DETAIL = format(
        'key=%s revision=%s action=%s evidence=%s',
        NEW."key", NEW."revision", NEW."evidenceAction", NEW."evidenceEventId"
      );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "FeatureFlagGeneration_90_verify_evidence"
AFTER INSERT OR UPDATE ON "FeatureFlagGeneration"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "verifyFeatureFlagGenerationEvidence"();

ALTER TABLE "FeatureFlagOverride"
  ENABLE TRIGGER "FeatureFlagOverride_00_require_current_image";
ALTER TABLE "FeatureFlagOverride"
  ENABLE TRIGGER "FeatureFlagOverride_10_prepare_revision";
ALTER TABLE "FeatureFlagOverride"
  ENABLE TRIGGER "FeatureFlagOverride_20_finish_mutation";

COMMIT;
