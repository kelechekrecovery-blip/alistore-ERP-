import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { Client } from 'pg';
import {
  controlFeatureFlag,
  parseFeatureFlagControlArgs,
  validateFeatureFlagControlTestDatabaseUrl,
} from './feature-flag-control.mjs';

const databaseUrl = validateFeatureFlagControlTestDatabaseUrl(
  process.env.TEST_DATABASE_URL,
  [process.env.FEATURE_FLAG_CONTROL_PROTECTED_DATABASE_URL],
);
const client = new Client({ connectionString: databaseUrl });
const key = 'supply.to_order_checkout';
const eventIds = [];

before(async () => client.connect());
beforeEach(clearState);
after(async () => {
  await clearState();
  await client.end();
});

test('argument parsing requires allowlisted, OCC-bound, explicitly confirmed mutations', async () => {
  assert.throws(
    () => validateFeatureFlagControlTestDatabaseUrl(
      'postgresql://alistore@db.example.com:5432/alistore_test?schema=public',
    ),
    /loopback/,
  );
  assert.throws(
    () => validateFeatureFlagControlTestDatabaseUrl(
      'postgresql://alistore@localhost:5432/alistore_test?host=db.example.com',
    ),
    /parameter host/,
  );
  assert.throws(
    () => validateFeatureFlagControlTestDatabaseUrl(
      'postgresql://alistore@localhost:5432/alistore_test?schema=public',
      ['postgres://other@127.0.0.1:5432/alistore_test'],
    ),
    /must differ/,
  );
  assert.throws(
    () => parseFeatureFlagControlArgs(['set', '--key', 'unknown', '--enabled', 'true']),
    /allowlisted/,
  );
  assert.throws(
    () => parseFeatureFlagControlArgs(['reset', '--key', key, '--reason', 'x', '--actor', 'ops']),
    /list\|set/,
  );
  await assert.rejects(
    controlFeatureFlag({ client: {}, command: { action: 'reset' } }),
    /only list or explicit database set/,
  );
  assert.throws(
    () => parseFeatureFlagControlArgs([
      'set', '--key', key, '--enabled', 'true', '--reason', 'x', '--actor', 'ops',
      '--expected-revision', 'none',
    ]),
    /confirm-current-image-control/,
  );
});

test('a stalled advisory lock is bounded and rolls back the incident transaction', async () => {
  const queries = [];
  const stalledClient = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('pg_advisory_xact_lock')) {
        const error = new Error('canceling statement due to statement timeout');
        error.code = '57014';
        throw error;
      }
      return { rows: [] };
    },
  };
  await assert.rejects(controlFeatureFlag({
    client: stalledClient,
    env: {},
    command: {
      action: 'set', key, enabled: false, reason: 'Bound incident wait', actor: 'ops-owner',
      expectedRevision: null, confirmed: true,
    },
  }), /statement timeout/);
  assert.deepEqual(queries, [
    'BEGIN',
    "SET LOCAL lock_timeout = '10s'",
    "SET LOCAL statement_timeout = '15s'",
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    'ROLLBACK',
  ]);
});

test('list never guesses a separate deployment fallback or exposes its raw environment value', async () => {
  const states = await controlFeatureFlag({
    client,
    command: { action: 'list' },
  });
  const state = states.find((item) => item.key === key);
  assert.deepEqual(state, {
    key,
    enabled: null,
    source: 'unverified-fallback',
    overrideActive: false,
    overrideRevision: null,
  });
  assert.doesNotMatch(JSON.stringify(states), /secret-suffix/);
});

test('explicit set uses the current marker, monotonic OCC and exact correlated audit evidence', async () => {
  const enabled = await controlFeatureFlag({
    client,
    command: {
      action: 'set', key, enabled: true, reason: 'Rollback control enable', actor: 'ops-owner',
      expectedRevision: null, confirmed: true,
    },
  });
  assert.deepEqual(enabled, {
    key, enabled: true, source: 'database', overrideActive: true, overrideRevision: 1,
  });
  const row = await client.query(`
    SELECT "evidenceEventId", "evidenceRevision", "evidenceVersion", "revision"
    FROM "FeatureFlagOverride" WHERE "key" = $1
  `, [key]);
  const eventId = row.rows[0].evidenceEventId;
  eventIds.push(eventId);
  assert.deepEqual(row.rows[0], {
    evidenceEventId: eventId, evidenceRevision: 1, evidenceVersion: 2, revision: 1,
  });
  const event = await client.query('SELECT payload FROM "AuditEvent" WHERE id = $1', [eventId]);
  assert.deepEqual(event.rows[0].payload, {
    key,
    reason: 'Rollback control enable',
    mutationId: eventId,
    revision: 1,
    before: { enabled: null, source: 'unverified-fallback' },
    after: { enabled: true, source: 'database' },
  });
  const setGeneration = await client.query(`
    SELECT "evidenceEventId", "evidenceRevision", "evidenceAction", "revision"
    FROM "FeatureFlagGeneration" WHERE "key" = $1
  `, [key]);
  assert.deepEqual(setGeneration.rows[0], {
    evidenceEventId: eventId,
    evidenceRevision: 1,
    evidenceAction: 'set',
    revision: 1,
  });

  await assert.rejects(controlFeatureFlag({
    client,
    command: {
      action: 'set', key, enabled: false, reason: 'stale', actor: 'ops-owner',
      expectedRevision: null, confirmed: true,
    },
  }), /revision conflict/);

  const disabled = await controlFeatureFlag({
    client,
    command: {
      action: 'set', key, enabled: false, reason: 'Rollback control explicit disable', actor: 'ops-owner',
      expectedRevision: 1, confirmed: true,
    },
  });
  assert.deepEqual(disabled, {
    key, enabled: false, source: 'database', overrideActive: true, overrideRevision: 2,
  });
  const disabledEvent = await client.query(`
    SELECT id, payload FROM "AuditEvent"
    WHERE type = 'feature_flag.changed' AND payload->>'reason' = 'Rollback control explicit disable'
  `);
  eventIds.push(disabledEvent.rows[0].id);
  assert.equal(disabledEvent.rows[0].payload.mutationId, disabledEvent.rows[0].id);
  assert.equal(disabledEvent.rows[0].payload.revision, 2);
  assert.deepEqual(disabledEvent.rows[0].payload.before, {
    enabled: true,
    source: 'database',
  });
  const disabledGeneration = await client.query(`
    SELECT "evidenceEventId", "evidenceRevision", "evidenceAction", "revision"
    FROM "FeatureFlagGeneration" WHERE "key" = $1
  `, [key]);
  assert.deepEqual(disabledGeneration.rows[0], {
    evidenceEventId: disabledEvent.rows[0].id,
    evidenceRevision: 2,
    evidenceAction: 'set',
    revision: 2,
  });
});

async function clearState() {
  await client.query('BEGIN');
  try {
    await client.query(
      "SELECT set_config('alistore.feature_flag_mutation_contract', 'generation-v2', true)",
    );
    await client.query(
      'ALTER TABLE "FeatureFlagOverride" DISABLE TRIGGER "FeatureFlagOverride_00_require_current_image"',
    );
    await client.query(
      'ALTER TABLE "FeatureFlagOverride" DISABLE TRIGGER "FeatureFlagOverride_10_prepare_revision"',
    );
    await client.query(
      'ALTER TABLE "FeatureFlagOverride" DISABLE TRIGGER "FeatureFlagOverride_20_finish_mutation"',
    );
    await client.query(
      'ALTER TABLE "FeatureFlagGeneration" DISABLE TRIGGER "FeatureFlagGeneration_00_prevent_destruction"',
    );
    await client.query(
      'ALTER TABLE "FeatureFlagEvidenceConsumption" DISABLE TRIGGER "FeatureFlagEvidenceConsumption_00_guard_rows"',
    );
    await client.query(
      'ALTER TABLE "AuditEvent" DISABLE TRIGGER "AuditEvent_90_protect_feature_flag_evidence"',
    );
    await client.query('DELETE FROM "FeatureFlagOverride" WHERE "key" = $1', [key]);
    await client.query('DELETE FROM "FeatureFlagGeneration" WHERE "key" = $1', [key]);
    await client.query(
      'DELETE FROM "FeatureFlagEvidenceConsumption" WHERE "key" = $1',
      [key],
    );
    await client.query(`
      DELETE FROM "AuditEvent"
      WHERE type = 'feature_flag.changed'
        AND (payload->>'reason' LIKE 'Rollback control%' OR id = ANY($1::TEXT[]))
    `, [eventIds]);
    await client.query(
      'ALTER TABLE "AuditEvent" ENABLE TRIGGER "AuditEvent_90_protect_feature_flag_evidence"',
    );
    await client.query(
      'ALTER TABLE "FeatureFlagEvidenceConsumption" ENABLE TRIGGER "FeatureFlagEvidenceConsumption_00_guard_rows"',
    );
    await client.query(
      'ALTER TABLE "FeatureFlagGeneration" ENABLE TRIGGER "FeatureFlagGeneration_00_prevent_destruction"',
    );
    await client.query(
      'ALTER TABLE "FeatureFlagOverride" ENABLE TRIGGER "FeatureFlagOverride_20_finish_mutation"',
    );
    await client.query(
      'ALTER TABLE "FeatureFlagOverride" ENABLE TRIGGER "FeatureFlagOverride_10_prepare_revision"',
    );
    await client.query(
      'ALTER TABLE "FeatureFlagOverride" ENABLE TRIGGER "FeatureFlagOverride_00_require_current_image"',
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
