import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import 'dotenv/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const prismaRoot = path.resolve(here, '../prisma');
const migrationsRoot = path.join(prismaRoot, 'migrations');
const recordedMigration = '20260806_feature_flag_overrides_z_generation_boundary';
const repairMigration = '20260806_feature_flag_overrides_zz_generation_cutover_repair';
const evidenceMigration = '20260807_feature_flag_override_evidence_binding';
const mutationSetting = 'alistore.feature_flag_mutation_contract';
const mutationContract = 'generation-v2';
const pauseLockKey = 2_608_060_005;
const recordedMigrationSha256 = Object.freeze({
  '20260806_feature_flag_overrides': '7f727abfd636e404905fdd0df7c9955faebb88ea0fa8ce9c1ee82fed3125ff1d',
  '20260806_feature_flag_overrides_revision': 'dde8f3c41be9dab60087b913bc34a50ed06b3cc6cd1f6d4557983dc7265f7afc',
  '20260806_feature_flag_overrides_tombstone': 'a7078c0c5c63e908a532c32ee5a0f7a9192b8c99bb5d8bd3784266e00df8ed38',
  [recordedMigration]: 'dc4d83a41462d1cc14897ef37a83b5d44575fe04d084d030b7e3c77662bd2472',
  [repairMigration]: 'cea5ae353ff344094b453457cff156332a36a43258ddfed53eed4877187486a0',
});
const featureFlagMigrations = [
  '20260806_feature_flag_overrides',
  '20260806_feature_flag_overrides_revision',
  '20260806_feature_flag_overrides_tombstone',
  recordedMigration,
];

const source = parseAndValidateSourceUrl(process.env.TEST_DATABASE_URL);
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
adminUrl.search = '';

for (const [migration, expectedSha256] of Object.entries(recordedMigrationSha256)) {
  const sql = await readFile(path.join(migrationsRoot, migration, 'migration.sql'), 'utf8');
  assert.equal(
    createHash('sha256').update(sql).digest('hex'),
    expectedSha256,
    `${migration} must remain byte-for-byte identical to its recorded boundary`,
  );
}

const repairSql = await readFile(
  path.join(migrationsRoot, repairMigration, 'migration.sql'),
  'utf8',
);
assert.match(
  repairSql,
  /^BEGIN;\n\nSET LOCAL lock_timeout = '5s';\nLOCK TABLE "FeatureFlagOverride" IN ACCESS EXCLUSIVE MODE;/,
  'repair migration must bound and acquire ACCESS EXCLUSIVE before inspecting feature-flag state',
);
assert.match(
  repairSql,
  /current_setting\('alistore\.feature_flag_mutation_contract', true\).*generation-v2/s,
  'repair migration must reject unmarked feature-flag mutations',
);
assert.match(
  repairSql,
  /CREATE TRIGGER "FeatureFlagOverride_00_require_current_image"[\s\S]*?FOR EACH STATEMENT/,
  'mutation marker guard must reject zero-row legacy UPDATE/DELETE statements',
);
assert.match(
  repairSql,
  /Feature flag cutover requires explicit operator reconciliation/,
  'repair migration must fail closed when current row intent is ambiguous',
);
assert.doesNotMatch(
  repairSql,
  /latest_intent|ORDER BY\s+event\.ts|ORDER BY\s+.*event\.id/i,
  'repair migration must not guess mutation order from AuditEvent timestamps or ids',
);
assert.match(repairSql, /^COMMIT;\s*$/m, 'repair migration must release its barrier explicitly');

const evidenceSql = await readFile(
  path.join(migrationsRoot, evidenceMigration, 'migration.sql'),
  'utf8',
);
assert.match(
  evidenceSql,
  /jsonb_typeof[\s\S]*after[\s\S]*enabled[\s\S]*boolean/,
  'evidence migration must require after.enabled to be a JSON boolean',
);
assert.match(
  evidenceSql,
  /evidenceEventId/,
  'evidence migration must durably bind each current override to one event',
);
assert.match(
  evidenceSql,
  /evidenceRevision/,
  'evidence migration must bind evidence to the current override revision',
);
assert.match(
  evidenceSql,
  /FeatureFlagGeneration_00_prevent_destruction[\s\S]*BEFORE DELETE OR TRUNCATE/,
  'evidence migration must preserve the durable generation against delete and truncate',
);
assert.match(
  evidenceSql,
  /FeatureFlagOverride_evidenceEventId_fkey[\s\S]*FeatureFlagGeneration_evidenceEventId_fkey/,
  'override and generation bindings must retain their referenced audit events',
);
assert.match(
  evidenceSql,
  /AuditEvent_90_protect_feature_flag_evidence/,
  'binding-critical fields of referenced audit events must be immutable',
);
assert.match(
  evidenceSql,
  /FeatureFlagOverride_00_prevent_truncate/,
  'override truncate must not bypass generation and evidence',
);
assert.match(
  evidenceSql,
  /pg_trigger_depth\(\) <> 2[\s\S]*FeatureFlagGeneration_10_require_override_writer/,
  'generation writes must originate in the nested override mutation trigger',
);
assert.match(
  evidenceSql,
  /CREATE TABLE "FeatureFlagEvidenceConsumption"[\s\S]*Feature flag evidence must be inserted by the mutation transaction/,
  'v2 events must be permanently consumed before their same-transaction insert',
);
assert.match(
  evidenceSql,
  /AuditEvent_10_require_feature_flag_consumption[\s\S]*event\.xmin::TEXT = consumption\."transactionId"|event\.xmin::TEXT = consumption\."transactionId"[\s\S]*AuditEvent_10_require_feature_flag_consumption/,
  'event insertion and deferred verification must share the consuming transaction id',
);
assert.match(
  evidenceSql,
  /AuditEvent_90_protect_feature_flag_evidence[\s\S]*BEFORE UPDATE OR DELETE|BEFORE UPDATE OR DELETE[\s\S]*AuditEvent_90_protect_feature_flag_evidence/,
  'feature-flag evidence events must stay immutable after supersession',
);

const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const databaseNames = {
  cutover: `alistore_test_feature_flag_cutover_${suffix}`,
  reconciliation: `alistore_test_feature_flag_reconciliation_${suffix}`,
  evidence: `alistore_test_feature_flag_evidence_${suffix}`,
  deploy: `alistore_test_feature_flag_deploy_${suffix}`,
};
const createdDatabases = [];
const temporaryPrismaRoot = await mkdtemp(path.join(os.tmpdir(), 'alistore-feature-flag-migrate-'));

function parseAndValidateSourceUrl(rawUrl) {
  if (!rawUrl) throw new Error('TEST_DATABASE_URL is required');

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Feature-flag migration upgrade test requires a PostgreSQL URL');
  }
  if (url.hash) throw new Error('Feature-flag migration upgrade test refuses URL fragments');

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('Feature-flag migration upgrade test requires loopback PostgreSQL');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error('Feature-flag migration upgrade test refuses an invalid database path');
  }
  if (!databaseName || databaseName.includes('/') || !/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error(`Refusing migration upgrade test against non-test database ${url.pathname}`);
  }

  for (const [name, value] of url.searchParams) {
    if (name === 'schema' && value === 'public') continue;
    if (
      name === 'connection_limit'
      && /^\d+$/.test(value)
      && Number(value) >= 1
      && Number(value) <= 20
    ) continue;
    throw new Error(`Feature-flag migration upgrade test refuses PostgreSQL URL parameter ${name}`);
  }
  return url;
}

function assertDisposableDatabaseName(databaseName) {
  assert.match(
    databaseName,
    /^alistore_test_feature_flag_(cutover|reconciliation|evidence|deploy)_\d+_[a-z0-9]+$/,
    'refusing to create or drop an unexpected database name',
  );
}

function databaseUrl(databaseName) {
  assertDisposableDatabaseName(databaseName);
  const url = new URL(source);
  url.pathname = `/${databaseName}`;
  url.search = '';
  return url.toString();
}

function clientFor(databaseName) {
  return new Client({
    connectionString: databaseUrl(databaseName),
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
  });
}

async function applyMigration(db, name) {
  const sql = await readFile(path.join(migrationsRoot, name, 'migration.sql'), 'utf8');
  await db.query(sql);
}

async function prepareRecordedSchema(db) {
  await createAuditFixture(db);
  for (const name of featureFlagMigrations) await applyMigration(db, name);
}

async function createAuditFixture(db) {
  await db.query(`
    CREATE TABLE "AuditEvent" (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      actor TEXT NOT NULL,
      ts TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      payload JSONB NOT NULL,
      refs TEXT[]
    )
  `);
}

async function insertAuditEvent(db, {
  id,
  key,
  sourceName,
  reason,
  actor,
  enabled = true,
  includeEnabled = true,
  timestampOffset = 0,
}) {
  const after = { source: sourceName };
  if (includeEnabled) after.enabled = enabled;
  await db.query(`
    INSERT INTO "AuditEvent" (id, type, actor, ts, payload, refs)
    VALUES (
      $1,
      'feature_flag.changed',
      $2,
      TIMESTAMP '2026-08-06 00:00:00' + ($3 * INTERVAL '1 second'),
      $5::JSONB,
      ARRAY[$4]::TEXT[]
    )
  `, [id, actor, timestampOffset, key, JSON.stringify({ key, reason, after })]);
}

async function insertAuditHistory(db, key, count, {
  finalSource = 'database',
  finalReason = `Revision ${count}`,
  finalEnabled = true,
  actor = 'old-image',
} = {}) {
  for (let revision = 1; revision <= count; revision += 1) {
    await insertAuditEvent(db, {
      id: `${key}-event-${revision}`,
      key,
      sourceName: revision === count ? finalSource : 'database',
      reason: revision === count ? finalReason : `Historical revision ${revision}`,
      enabled: revision === count ? finalEnabled : true,
      actor,
      timestampOffset: revision,
    });
  }
}

async function waitForTableLock(observer, pid, granted) {
  const deadline = Date.now() + 7_500;
  while (Date.now() < deadline) {
    const result = await observer.query(`
      SELECT 1
      FROM pg_locks
      WHERE pid = $1
        AND relation = '"FeatureFlagOverride"'::regclass
        AND mode = 'AccessExclusiveLock'
        AND granted = $2
    `, [pid, granted]);
    if (result.rowCount === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ACCESS EXCLUSIVE granted=${granted}`);
}

async function waitForExactBlocker(observer, blockedPid, blockerPid) {
  const deadline = Date.now() + 7_500;
  while (Date.now() < deadline) {
    const result = await observer.query(
      'SELECT pg_blocking_pids($1::INTEGER) AS blockers',
      [blockedPid],
    );
    if (result.rows[0]?.blockers?.includes(blockerPid)) {
      assert.deepEqual(result.rows[0].blockers, [blockerPid]);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`PID ${blockedPid} was not blocked only by PID ${blockerPid}`);
}

function assertCutoverRejection(error) {
  assert.equal(error?.code, '55000');
  assert.match(error?.message ?? '', /current application image required/i);
  return true;
}

async function markedTransaction(db, work) {
  await db.query('BEGIN');
  try {
    const marker = await db.query(
      'SELECT set_config($1, $2, true) AS marker',
      [mutationSetting, mutationContract],
    );
    assert.deepEqual(marker.rows, [{ marker: mutationContract }]);
    const result = await work();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function writeExactV2Set(db, {
  key,
  enabled,
  reason,
  actor,
  eventId,
  revision,
}) {
  return markedTransaction(db, async () => {
    await db.query(`
      INSERT INTO "FeatureFlagOverride" (
        "key", "enabled", "reason", "updatedBy", "active",
        "evidenceEventId", "evidenceRevision", "evidenceVersion", "updatedAt"
      ) VALUES ($1, $2, $3, $4, true, $5, $6, 2, CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO UPDATE
      SET "enabled" = EXCLUDED."enabled",
          "reason" = EXCLUDED."reason",
          "updatedBy" = EXCLUDED."updatedBy",
          "active" = true,
          "evidenceEventId" = EXCLUDED."evidenceEventId",
          "evidenceRevision" = EXCLUDED."evidenceRevision",
          "evidenceVersion" = 2,
          "updatedAt" = CURRENT_TIMESTAMP
    `, [key, enabled, reason, actor, eventId, revision]);
    await db.query(`
      INSERT INTO "AuditEvent" (id, type, actor, payload, refs)
      VALUES ($1, 'feature_flag.changed', $2, $3::JSONB, ARRAY[$4]::TEXT[])
    `, [eventId, actor, JSON.stringify({
      key,
      reason,
      mutationId: eventId,
      revision,
      after: { enabled, source: 'database' },
    }), key]);
  });
}

async function runCutoverProbe(databaseName) {
  const migration = clientFor(databaseName);
  const writer = clientFor(databaseName);
  const observer = clientFor(databaseName);
  await Promise.all([migration.connect(), writer.connect(), observer.connect()]);
  try {
    await createAuditFixture(migration);
    for (const name of featureFlagMigrations.slice(0, -1)) await applyMigration(migration, name);
    await migration.query(`
      INSERT INTO "FeatureFlagOverride" (
        "key", "enabled", "reason", "updatedBy", "revision", "active", "updatedAt"
      ) VALUES
        ('supply.to_order_checkout', true, 'Populated active', 'old-image', 5, true, CURRENT_TIMESTAMP),
        ('supply.cancellation', false, 'Populated tombstone', 'old-image', 7, false, CURRENT_TIMESTAMP)
    `);
    await insertAuditHistory(migration, 'supply.to_order_checkout', 5, {
      finalReason: 'Populated active',
    });
    await insertAuditHistory(migration, 'supply.cancellation', 7, {
      finalSource: 'default',
      finalReason: 'Populated tombstone',
    });
    await applyMigration(migration, recordedMigration);

    // A held read demonstrates that lock acquisition has a bounded operational
    // failure instead of waiting indefinitely during an unsafe deployment.
    await writer.query('BEGIN');
    await writer.query(`SELECT "key" FROM "FeatureFlagOverride" WHERE "key" = 'supply.to_order_checkout'`);
    const timeoutStartedAt = Date.now();
    const fastTimeoutSql = repairSql.replace(
      "SET LOCAL lock_timeout = '5s';",
      "SET LOCAL lock_timeout = '250ms';",
    );
    assert.notEqual(fastTimeoutSql, repairSql, 'timeout probe must shorten only its test copy');
    const timedOutMigration = migration.query(fastTimeoutSql);
    await waitForTableLock(observer, migration.processID, false);
    await waitForExactBlocker(observer, migration.processID, writer.processID);
    await assert.rejects(timedOutMigration, (error) => {
      assert.equal(error?.code, '55P03');
      assert.match(error?.message ?? '', /lock timeout/i);
      return true;
    });
    const timeoutDuration = Date.now() - timeoutStartedAt;
    assert.ok(timeoutDuration < 3_000, `unexpected lock timeout ${timeoutDuration}ms`);
    await migration.query('ROLLBACK');
    await writer.query('ROLLBACK');

    // Pause deterministically after ACCESS EXCLUSIVE is granted. Unlike a
    // sleep, the advisory lock lets pg_locks/pg_blocking_pids prove both sides
    // of the exact cutover barrier before the test releases it.
    await observer.query('SELECT pg_advisory_lock($1)', [pauseLockKey]);
    const pausedRepairSql = repairSql.replace(
      'LOCK TABLE "FeatureFlagOverride" IN ACCESS EXCLUSIVE MODE;',
      `LOCK TABLE "FeatureFlagOverride" IN ACCESS EXCLUSIVE MODE;\nSELECT pg_advisory_xact_lock(${pauseLockKey});`,
    );
    assert.notEqual(pausedRepairSql, repairSql, 'test pause must follow ACCESS EXCLUSIVE');

    await writer.query('BEGIN');
    await writer.query(`SELECT "key" FROM "FeatureFlagOverride" WHERE "key" = 'supply.to_order_checkout'`);
    let migrationSettled = false;
    const applying = migration.query(pausedRepairSql).finally(() => { migrationSettled = true; });
    await waitForTableLock(observer, migration.processID, false);
    await waitForExactBlocker(observer, migration.processID, writer.processID);

    // This lock conversion reproduces the review's SELECT-then-mutate shape.
    // Starting with ACCESS EXCLUSIVE avoids a later migration lock upgrade.
    await writer.query(`DELETE FROM "FeatureFlagOverride" WHERE "key" = 'supply.to_order_checkout'`);
    await insertAuditEvent(writer, {
      id: 'supply.to_order_checkout-event-6',
      key: 'supply.to_order_checkout',
      sourceName: 'default',
      reason: 'In-flight physical delete',
      actor: 'physical-image',
      timestampOffset: 6,
    });
    const staleObservation = await writer.query(`
      SELECT override."key" AS override_key, generation."revision"
      FROM "FeatureFlagGeneration" generation
      LEFT JOIN "FeatureFlagOverride" override USING ("key")
      WHERE generation."key" = 'supply.to_order_checkout'
    `);
    assert.deepEqual(staleObservation.rows, [{ override_key: null, revision: 6 }]);
    await writer.query('COMMIT');
    await waitForTableLock(observer, migration.processID, true);
    assert.equal(migrationSettled, false, 'repair must remain paused while holding ACCESS EXCLUSIVE');

    const legacyWrite = writer.query(`
      INSERT INTO "FeatureFlagOverride" ("key", "enabled", "reason", "updatedBy", "updatedAt")
      VALUES (
        'supply.to_order_checkout', false, 'Stale missing-row null create', 'physical-image',
        CURRENT_TIMESTAMP
      )
      RETURNING "revision"
    `).then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    );
    await waitForExactBlocker(observer, writer.processID, migration.processID);
    await observer.query('SELECT pg_advisory_unlock($1)', [pauseLockKey]);
    await applying;

    const legacyResult = await legacyWrite;
    assert.equal(legacyResult.status, 'rejected');
    assertCutoverRejection(legacyResult.reason);
    await assert.rejects(writer.query(`
      DELETE FROM "FeatureFlagOverride"
      WHERE "key" = 'supply.owner_resolution'
    `), assertCutoverRejection);

    const repaired = await observer.query(`
      SELECT generation."key", generation."revision", override."active"
      FROM "FeatureFlagGeneration" generation
      LEFT JOIN "FeatureFlagOverride" override USING ("key")
      ORDER BY generation."key"
    `);
    assert.deepEqual(repaired.rows, [
      { key: 'supply.auto_refund', revision: 1, active: null },
      { key: 'supply.cancellation', revision: 8, active: null },
      { key: 'supply.owner_resolution', revision: 1, active: null },
      { key: 'supply.partial_handover', revision: 1, active: null },
      { key: 'supply.quarantine_conversion', revision: 1, active: null },
      { key: 'supply.to_order_checkout', revision: 7, active: null },
    ]);

    // Reads have no marker requirement, including a rollback image's
    // row-presence evaluation.
    const compatibleRead = await writer.query(`
      SELECT "enabled" FROM "FeatureFlagOverride" WHERE "key" = 'supply.to_order_checkout'
    `);
    assert.deepEqual(compatibleRead.rows, []);

    // Every unmarked legacy shape now fails closed.
    await assert.rejects(writer.query(`
      INSERT INTO "FeatureFlagOverride" (
        "key", "enabled", "reason", "updatedBy", "active", "updatedAt"
      ) VALUES (
        'supply.owner_resolution', true, 'Tombstone-image set', 'tombstone-image', true,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("key") DO UPDATE
      SET "active" = false,
          "revision" = "FeatureFlagOverride"."revision" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
    `), assertCutoverRejection);

    const inserted = await markedTransaction(writer, () => writer.query(`
      INSERT INTO "FeatureFlagOverride" ("key", "enabled", "reason", "updatedBy", "updatedAt")
      VALUES ('supply.auto_refund', true, 'Current-image insert', 'current-image', CURRENT_TIMESTAMP)
      RETURNING "revision"
    `));
    assert.deepEqual(inserted.rows, [{ revision: 2 }]);
    const markerLeak = await writer.query(`
      SELECT NULLIF(current_setting($1, true), '') IS NULL AS cleared
    `, [mutationSetting]);
    assert.deepEqual(markerLeak.rows, [{ cleared: true }]);

    await assert.rejects(writer.query(`
      UPDATE "FeatureFlagOverride"
      SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "key" = 'supply.auto_refund'
    `), assertCutoverRejection);
    await assert.rejects(
      writer.query(`DELETE FROM "FeatureFlagOverride" WHERE "key" = 'supply.auto_refund'`),
      assertCutoverRejection,
    );

    const updated = await markedTransaction(writer, () => writer.query(`
      UPDATE "FeatureFlagOverride"
      SET "enabled" = false,
          "reason" = 'Current-image update',
          "updatedBy" = 'current-image',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "key" = 'supply.auto_refund'
      RETURNING "revision"
    `));
    assert.deepEqual(updated.rows, [{ revision: 3 }]);
    await markedTransaction(writer, () => writer.query(`
      DELETE FROM "FeatureFlagOverride" WHERE "key" = 'supply.auto_refund'
    `));
    const currentState = await observer.query(`
      SELECT override."key" AS override_key, generation."revision"
      FROM "FeatureFlagGeneration" generation
      LEFT JOIN "FeatureFlagOverride" override USING ("key")
      WHERE generation."key" = 'supply.auto_refund'
    `);
    assert.deepEqual(currentState.rows, [{ override_key: null, revision: 4 }]);
  } finally {
    await observer.query('SELECT pg_advisory_unlock($1)', [pauseLockKey]).catch(() => undefined);
    await Promise.all([migration.end(), writer.end(), observer.end()]);
  }
}

async function runReconciliationProbe(databaseName) {
  const db = clientFor(databaseName);
  await db.connect();
  try {
    await prepareRecordedSchema(db);
    const repeatedReason = 'Repeated operator intent';
    const repeatedActor = 'owner-ambiguous';
    await db.query(`
      INSERT INTO "FeatureFlagOverride" (
        "key", "enabled", "reason", "updatedBy", "active", "updatedAt"
      ) VALUES (
        'supply.partial_handover', false, $1, $2, true, CURRENT_TIMESTAMP
      )
    `, [repeatedReason, repeatedActor]);
    await insertAuditEvent(db, {
      id: 'z-database-intent',
      key: 'supply.partial_handover',
      sourceName: 'database',
      reason: repeatedReason,
      actor: repeatedActor,
      enabled: false,
    });

    const brokenReset = await db.query(`
      INSERT INTO "FeatureFlagOverride" (
        "key", "enabled", "reason", "updatedBy", "active", "updatedAt"
      ) VALUES (
        'supply.partial_handover', true, $1, $2, false, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("key") DO UPDATE
      SET "reason" = EXCLUDED."reason",
          "updatedBy" = EXCLUDED."updatedBy",
          "active" = false,
          "revision" = "FeatureFlagOverride"."revision" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "active", "revision"
    `, [repeatedReason, repeatedActor]);
    assert.deepEqual(brokenReset.rows, [{ active: true, revision: 3 }]);
    await insertAuditEvent(db, {
      id: 'a-fallback-intent',
      key: 'supply.partial_handover',
      sourceName: 'environment',
      reason: repeatedReason,
      actor: repeatedActor,
    });

    // Both events deliberately have the same timestamp and misleading ids.
    // There is no safe "latest" ordering, so cutover must stop with evidence.
    await assert.rejects(db.query(repairSql), (error) => {
      assert.equal(error?.code, 'P0001');
      assert.match(error?.message ?? '', /explicit operator reconciliation/i);
      assert.match(error?.detail ?? '', /supply\.partial_handover\(.*database=1,fallback=1,unknown=0,/);
      assert.match(error?.hint ?? '', /DELETE.*PATCH/i);
      return true;
    });
    await db.query('ROLLBACK');
    const unchanged = await db.query(`
      SELECT override."active", override."revision", generation."revision" AS generation
      FROM "FeatureFlagOverride" override
      JOIN "FeatureFlagGeneration" generation USING ("key")
      WHERE override."key" = 'supply.partial_handover'
    `);
    assert.deepEqual(unchanged.rows, [{ active: true, revision: 3, generation: 3 }]);

    // The operator explicitly confirms the desired active state through the
    // current mutation shape with a unique reason, creating row-bound evidence.
    const reconciliationReason = 'Cutover reconciliation: keep active';
    await db.query('BEGIN');
    await db.query(`
      UPDATE "FeatureFlagOverride"
      SET "enabled" = false,
          "reason" = $1,
          "updatedBy" = 'owner-reconciler',
          "active" = true,
          "revision" = "revision" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "key" = 'supply.partial_handover'
    `, [reconciliationReason]);
    await insertAuditEvent(db, {
      id: 'reconciled-database-intent',
      key: 'supply.partial_handover',
      sourceName: 'database',
      reason: reconciliationReason,
      actor: 'owner-reconciler',
      enabled: false,
      timestampOffset: 1,
    });
    await db.query('COMMIT');

    await db.query(repairSql);
    const reconciled = await db.query(`
      SELECT override."active", override."revision", generation."revision" AS generation
      FROM "FeatureFlagOverride" override
      JOIN "FeatureFlagGeneration" generation USING ("key")
      WHERE override."key" = 'supply.partial_handover'
    `);
    assert.deepEqual(reconciled.rows, [{ active: true, revision: 5, generation: 5 }]);
    await assert.rejects(
      db.query(`DELETE FROM "FeatureFlagOverride" WHERE "key" = 'supply.partial_handover'`),
      assertCutoverRejection,
    );
  } finally {
    await db.end();
  }
}

async function runEvidenceBindingProbe(databaseName) {
  const db = clientFor(databaseName);
  const contender = clientFor(databaseName);
  await Promise.all([db.connect(), contender.connect()]);
  try {
    await prepareRecordedSchema(db);
    const fixtures = [
      {
        key: 'supply.to_order_checkout', enabled: true, reason: 'Missing boolean', actor: 'owner-missing',
        events: [{ id: 'missing-enabled', includeEnabled: false }],
      },
      {
        key: 'supply.auto_refund', enabled: false, reason: 'Malformed boolean', actor: 'owner-malformed',
        events: [{ id: 'malformed-enabled', enabled: 'false' }],
      },
      {
        key: 'supply.owner_resolution', enabled: true, reason: 'Opposite boolean', actor: 'owner-opposite',
        events: [{ id: 'opposite-enabled', enabled: false }],
      },
      {
        key: 'supply.quarantine_conversion', enabled: false, reason: 'Conflicting booleans', actor: 'owner-conflict',
        events: [
          { id: 'conflict-exact', enabled: false },
          { id: 'conflict-opposite', enabled: true },
        ],
      },
    ];

    for (const fixture of fixtures) {
      await db.query(`
        INSERT INTO "FeatureFlagOverride" (
          "key", "enabled", "reason", "updatedBy", "active", "updatedAt"
        ) VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
      `, [fixture.key, fixture.enabled, fixture.reason, fixture.actor]);
      for (const event of fixture.events) {
        await insertAuditEvent(db, {
          ...event,
          key: fixture.key,
          sourceName: 'database',
          reason: fixture.reason,
          actor: fixture.actor,
        });
      }
    }

    // The already-recorded repair checked only source and therefore accepts
    // all four adversarial rows. The new additive verifier must catch them.
    await db.query(repairSql);
    await assert.rejects(db.query(evidenceSql), (error) => {
      assert.equal(error?.code, 'P0001');
      assert.match(error?.message ?? '', /evidence binding requires explicit operator reconciliation/i);
      assert.match(error?.detail ?? '', /supply\.to_order_checkout\(.*exact=0,malformed=1,opposite=0\)/);
      assert.match(error?.detail ?? '', /supply\.auto_refund\(.*exact=0,malformed=1,opposite=0\)/);
      assert.match(error?.detail ?? '', /supply\.owner_resolution\(.*exact=0,malformed=0,opposite=1\)/);
      assert.match(error?.detail ?? '', /supply\.quarantine_conversion\(.*fingerprint=2,exact=1,malformed=0,opposite=1\)/);
      return true;
    });
    await db.query('ROLLBACK');
    const rolledBackColumns = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'FeatureFlagOverride'
        AND column_name LIKE 'evidence%'
    `);
    assert.deepEqual(rolledBackColumns.rows, []);

    const reconciledIds = new Map();
    for (const [index, fixture] of fixtures.entries()) {
      const reason = `Evidence reconciliation ${index + 1}`;
      const actor = 'current-control';
      const eventId = `reconciled-evidence-${index + 1}`;
      reconciledIds.set(fixture.key, eventId);
      await markedTransaction(db, async () => {
        await db.query(`
          UPDATE "FeatureFlagOverride"
          SET "enabled" = $2,
              "reason" = $3,
              "updatedBy" = $4,
              "active" = true,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "key" = $1
        `, [fixture.key, fixture.enabled, reason, actor]);
        await insertAuditEvent(db, {
          id: eventId,
          key: fixture.key,
          sourceName: 'database',
          reason,
          actor,
          enabled: fixture.enabled,
        });
      });
    }

    const precreatedEventId = 'precreated-exact-v2-event';
    const precreatedKey = 'supply.cancellation';
    await db.query(`
      INSERT INTO "AuditEvent" (id, type, actor, payload, refs)
      VALUES ($1, 'feature_flag.changed', 'precreator', $2::JSONB, ARRAY[$3]::TEXT[])
    `, [precreatedEventId, JSON.stringify({
      key: precreatedKey,
      reason: 'Precreated exact v2 event',
      mutationId: precreatedEventId,
      revision: 2,
      after: { enabled: true, source: 'database' },
    }), precreatedKey]);

    await db.query(evidenceSql);
    const bound = await db.query(`
      SELECT "key", "revision", "evidenceEventId", "evidenceRevision", "evidenceVersion"
      FROM "FeatureFlagOverride"
      ORDER BY "key"
    `);
    assert.equal(bound.rowCount, fixtures.length);
    for (const row of bound.rows) {
      assert.equal(row.evidenceEventId, reconciledIds.get(row.key));
      assert.equal(row.evidenceRevision, row.revision);
      assert.equal(row.evidenceVersion, 1);
    }

    const boundGenerations = await db.query(`
      SELECT "key", "revision", "evidenceEventId", "evidenceRevision", "evidenceAction"
      FROM "FeatureFlagGeneration"
      WHERE "key" = ANY($1::TEXT[])
      ORDER BY "key"
    `, [fixtures.map(({ key }) => key)]);
    assert.equal(boundGenerations.rowCount, fixtures.length);
    for (const row of boundGenerations.rows) {
      assert.equal(row.evidenceEventId, reconciledIds.get(row.key));
      assert.equal(row.evidenceRevision, row.revision);
      assert.equal(row.evidenceAction, 'set');
    }

    await assert.rejects(markedTransaction(db, () => db.query(`
      INSERT INTO "FeatureFlagOverride" (
        "key", "enabled", "reason", "updatedBy", "active",
        "evidenceEventId", "evidenceRevision", "evidenceVersion", "updatedAt"
      ) VALUES ($1, true, 'Precreated exact v2 event', 'precreator', true, $2, 2, 2, CURRENT_TIMESTAMP)
    `, [precreatedKey, precreatedEventId])), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /inserted by the mutation transaction/i);
      return true;
    });

    const concurrentKey = 'supply.concurrent_claim_test';
    const concurrentEventId = 'same-xid-owned-event';
    const concurrentReason = 'Same transaction owns event insert';
    await db.query('BEGIN');
    try {
      await db.query(
        'SELECT set_config($1, $2, true)',
        [mutationSetting, mutationContract],
      );
      await db.query(`
        INSERT INTO "FeatureFlagOverride" (
          "key", "enabled", "reason", "updatedBy", "active",
          "evidenceEventId", "evidenceRevision", "evidenceVersion", "updatedAt"
        ) VALUES ($1, true, $2, 'current-image', true, $3, 1, 2, CURRENT_TIMESTAMP)
      `, [concurrentKey, concurrentReason, concurrentEventId]);

      const payload = JSON.stringify({
        key: concurrentKey,
        reason: concurrentReason,
        mutationId: concurrentEventId,
        revision: 1,
        after: { enabled: true, source: 'database' },
      });
      await assert.rejects(contender.query(`
        INSERT INTO "AuditEvent" (id, type, actor, payload, refs)
        VALUES ($1, 'feature_flag.changed', 'current-image', $2::JSONB, ARRAY[$3]::TEXT[])
      `, [concurrentEventId, payload, concurrentKey]), (error) => {
        assert.equal(error?.code, '23514');
        assert.match(error?.message ?? '', /claimed by its mutation transaction/i);
        return true;
      });
      await db.query(`
        INSERT INTO "AuditEvent" (id, type, actor, payload, refs)
        VALUES ($1, 'feature_flag.changed', 'current-image', $2::JSONB, ARRAY[$3]::TEXT[])
      `, [concurrentEventId, payload, concurrentKey]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    const xidBinding = await db.query(`
      SELECT
        consumption."transactionId" AS consumption_xid,
        event.xmin::TEXT AS event_xid
      FROM "FeatureFlagEvidenceConsumption" AS consumption
      JOIN "AuditEvent" AS event ON event.id = consumption."eventId"
      WHERE consumption."eventId" = $1
    `, [concurrentEventId]);
    assert.equal(xidBinding.rows[0].consumption_xid, xidBinding.rows[0].event_xid);

    const supersessionKey = 'supply.partial_handover';
    const supersededEventId = 'same-transaction-v2-event-2';
    await writeExactV2Set(db, {
      key: supersessionKey,
      enabled: true,
      reason: 'Same-transaction v2 set revision 2',
      actor: 'current-image',
      eventId: supersededEventId,
      revision: 2,
    });
    await writeExactV2Set(db, {
      key: supersessionKey,
      enabled: false,
      reason: 'Same-transaction v2 set revision 3',
      actor: 'current-image',
      eventId: 'same-transaction-v2-event-3',
      revision: 3,
    });
    await assert.rejects(db.query(`
      UPDATE "AuditEvent"
      SET payload = jsonb_set(payload, '{revision}', '4'::JSONB)
      WHERE id = $1
    `, [supersededEventId]), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /append-only and immutable/i);
      return true;
    });
    await assert.rejects(markedTransaction(db, () => db.query(`
      UPDATE "FeatureFlagOverride"
      SET "enabled" = true,
          "reason" = 'Attempt superseded event replay',
          "updatedBy" = 'replayer',
          "evidenceEventId" = $2,
          "evidenceRevision" = 4,
          "evidenceVersion" = 2,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "key" = $1
    `, [supersessionKey, supersededEventId])), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /inserted by the mutation transaction/i);
      return true;
    });

    await assert.rejects(db.query(`
      DELETE FROM "FeatureFlagGeneration"
      WHERE "key" = 'supply.to_order_checkout'
    `), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /generation is append-preserving/i);
      return true;
    });
    await assert.rejects(db.query('TRUNCATE TABLE "FeatureFlagGeneration"'), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /generation is append-preserving/i);
      return true;
    });
    await assert.rejects(db.query('TRUNCATE TABLE "FeatureFlagOverride"'), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /overrides cannot be truncated/i);
      return true;
    });

    // Even a syntactically valid reset event and a caller-set mutation marker
    // cannot create or rewrite the durable generation outside the nested
    // FeatureFlagOverride trigger path.
    await assert.rejects(markedTransaction(db, async () => {
      const eventId = 'fabricated-generation-insert';
      const key = 'supply.fabricated_generation';
      await db.query(`
        INSERT INTO "FeatureFlagGeneration" (
          "key", "revision", "evidenceEventId", "evidenceRevision", "evidenceAction", "updatedAt"
        ) VALUES ($1, 1, $2, 1, 'reset', CURRENT_TIMESTAMP)
      `, [key, eventId]);
    }), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /only from the override mutation trigger/i);
      return true;
    });

    await assert.rejects(markedTransaction(db, async () => {
      const eventId = 'fabricated-generation-update';
      const key = 'supply.cancellation';
      await db.query(`
        UPDATE "FeatureFlagGeneration"
        SET "revision" = 1,
            "evidenceEventId" = $2,
            "evidenceRevision" = 1,
            "evidenceAction" = 'reset',
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "key" = $1
      `, [key, eventId]);
    }), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /only from the override mutation trigger/i);
      return true;
    });

    const boundEventId = reconciledIds.get('supply.to_order_checkout');
    await assert.rejects(db.query(`
      UPDATE "AuditEvent"
      SET payload = jsonb_set(payload, '{after,enabled}', 'false'::JSONB)
      WHERE id = $1
    `, [boundEventId]), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /append-only and immutable/i);
      return true;
    });
    await assert.rejects(
      db.query('DELETE FROM "AuditEvent" WHERE id = $1', [boundEventId]),
      (error) => {
        assert.equal(error?.code, '23514');
        assert.match(error?.message ?? '', /append-only and immutable/i);
        return true;
      },
    );

    await assert.rejects(markedTransaction(db, () => db.query(`
      DELETE FROM "FeatureFlagOverride"
      WHERE "key" = 'supply.to_order_checkout'
    `)), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /reset mutation ID is required/i);
      return true;
    });

    await assert.rejects(markedTransaction(db, async () => {
      await db.query(`
        SELECT set_config(
          'alistore.feature_flag_mutation_id',
          'marked-delete-without-event',
          true
        )
      `);
      await db.query(`
        DELETE FROM "FeatureFlagOverride"
        WHERE "key" = 'supply.to_order_checkout'
      `);
    }), (error) => {
      assert.equal(error?.code, '23503');
      assert.match(error?.message ?? '', /foreign key constraint/i);
      return true;
    });

    // Backfilled v1 evidence is read-compatible but immutable. A marked writer
    // cannot replay its historical event against a new row generation.
    await assert.rejects(markedTransaction(db, () => db.query(`
      UPDATE "FeatureFlagOverride"
      SET "evidenceRevision" = "revision" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "key" = 'supply.to_order_checkout'
    `)), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /legacy feature flag evidence is immutable/i);
      return true;
    });

    // The deferred invariant prevents a marked SQL bypass from changing state
    // without exact correlated evidence in the same transaction.
    await assert.rejects(markedTransaction(db, () => db.query(`
      UPDATE "FeatureFlagOverride"
      SET "enabled" = NOT "enabled",
          "evidenceEventId" = 'missing-correlated-event',
          "evidenceRevision" = "revision" + 1,
          "evidenceVersion" = 2,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "key" = 'supply.to_order_checkout'
    `)), (error) => {
      assert.equal(error?.code, '23514');
      assert.match(error?.message ?? '', /lacks exact bound audit evidence/i);
      return true;
    });
  } finally {
    await Promise.all([db.end(), contender.end()]);
  }
}

function runPrismaDeploy(schemaPath, targetDatabaseUrl) {
  const result = spawnSync(
    'npm',
    ['exec', '-w', '@alistore/api', '--', 'prisma', 'migrate', 'deploy', '--schema', schemaPath],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: targetDatabaseUrl },
      encoding: 'utf8',
      timeout: 90_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed:\n${result.stdout}\n${result.stderr}`);
  }
}

async function prepareTemporaryPrismaTree() {
  const schemaPath = path.join(temporaryPrismaRoot, 'schema.prisma');
  const temporaryMigrations = path.join(temporaryPrismaRoot, 'migrations');
  await mkdir(temporaryMigrations, { recursive: true });
  await writeFile(schemaPath, `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n`);
  await cp(
    path.join(migrationsRoot, 'migration_lock.toml'),
    path.join(temporaryMigrations, 'migration_lock.toml'),
  );
  const auditFixture = path.join(temporaryMigrations, '00000000000000_audit_fixture');
  await mkdir(auditFixture);
  await writeFile(path.join(auditFixture, 'migration.sql'), `
    CREATE TABLE "AuditEvent" (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      actor TEXT NOT NULL,
      ts TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      payload JSONB NOT NULL,
      refs TEXT[]
    );
  `);
  for (const name of featureFlagMigrations) {
    await cp(path.join(migrationsRoot, name), path.join(temporaryMigrations, name), { recursive: true });
  }
  return { schemaPath, temporaryMigrations };
}

async function runRecordedMigrationDeployProbe(databaseName) {
  const { schemaPath, temporaryMigrations } = await prepareTemporaryPrismaTree();
  runPrismaDeploy(schemaPath, databaseUrl(databaseName));

  const recorded = clientFor(databaseName);
  await recorded.connect();
  try {
    await recorded.query(`
      INSERT INTO "FeatureFlagGeneration" ("key", "revision", "updatedAt")
      VALUES ('supply.to_order_checkout', 5, CURRENT_TIMESTAMP)
    `);
    await insertAuditHistory(recorded, 'supply.to_order_checkout', 6, {
      finalSource: 'default',
      finalReason: 'Recorded missing-row reset',
    });
    await recorded.query(`
      INSERT INTO "FeatureFlagOverride" (
        "key", "enabled", "reason", "updatedBy", "active", "updatedAt"
      ) VALUES (
        'supply.quarantine_conversion', true, 'Recorded active override', 'recorded-current', true,
        CURRENT_TIMESTAMP
      )
    `);
    await insertAuditEvent(recorded, {
      id: 'recorded-active-event',
      key: 'supply.quarantine_conversion',
      sourceName: 'database',
      reason: 'Recorded active override',
      actor: 'recorded-current',
    });
  } finally {
    await recorded.end();
  }

  await cp(
    path.join(migrationsRoot, repairMigration),
    path.join(temporaryMigrations, repairMigration),
    { recursive: true },
  );
  runPrismaDeploy(schemaPath, databaseUrl(databaseName));
  await cp(
    path.join(migrationsRoot, evidenceMigration),
    path.join(temporaryMigrations, evidenceMigration),
    { recursive: true },
  );
  runPrismaDeploy(schemaPath, databaseUrl(databaseName));

  const verified = clientFor(databaseName);
  await verified.connect();
  try {
    const migrationRecords = await verified.query(`
      SELECT migration_name, finished_at IS NOT NULL AS finished
      FROM _prisma_migrations
      WHERE migration_name IN ($1, $2, $3)
      ORDER BY migration_name
    `, [recordedMigration, repairMigration, evidenceMigration]);
    assert.deepEqual(migrationRecords.rows, [
      { migration_name: recordedMigration, finished: true },
      { migration_name: repairMigration, finished: true },
      { migration_name: evidenceMigration, finished: true },
    ]);
    const fence = await verified.query(`
      SELECT generation."key", generation."revision", override."revision" AS override_revision
      FROM "FeatureFlagGeneration" generation
      LEFT JOIN "FeatureFlagOverride" override USING ("key")
      WHERE generation."key" IN ('supply.to_order_checkout', 'supply.quarantine_conversion')
      ORDER BY generation."key"
    `);
    assert.deepEqual(fence.rows, [
      { key: 'supply.quarantine_conversion', revision: 2, override_revision: 2 },
      { key: 'supply.to_order_checkout', revision: 6, override_revision: null },
    ]);
    const binding = await verified.query(`
      SELECT
        override."evidenceEventId",
        override."evidenceRevision",
        override."evidenceVersion",
        generation."evidenceEventId" AS generation_event,
        generation."evidenceRevision" AS generation_evidence_revision,
        generation."evidenceAction" AS generation_action
      FROM "FeatureFlagOverride" AS override
      JOIN "FeatureFlagGeneration" AS generation USING ("key")
      WHERE override."key" = 'supply.quarantine_conversion'
    `);
    assert.deepEqual(binding.rows, [{
      evidenceEventId: 'recorded-active-event',
      evidenceRevision: 2,
      evidenceVersion: 1,
      generation_event: 'recorded-active-event',
      generation_evidence_revision: 2,
      generation_action: 'set',
    }]);
    await assert.rejects(verified.query(`
      INSERT INTO "FeatureFlagOverride" ("key", "enabled", "reason", "updatedBy", "updatedAt")
      VALUES ('supply.to_order_checkout', true, 'Unmarked deploy probe', 'old-image', CURRENT_TIMESTAMP)
    `), assertCutoverRejection);
  } finally {
    await verified.end();
  }
}

const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5_000 });
await admin.connect();
try {
  for (const databaseName of Object.values(databaseNames)) {
    assertDisposableDatabaseName(databaseName);
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    createdDatabases.push(databaseName);
  }
  await runCutoverProbe(databaseNames.cutover);
  await runReconciliationProbe(databaseNames.reconciliation);
  await runEvidenceBindingProbe(databaseNames.evidence);
  await runRecordedMigrationDeployProbe(databaseNames.deploy);
} finally {
  for (const databaseName of createdDatabases.reverse()) {
    assertDisposableDatabaseName(databaseName);
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
  }
  await admin.end();
  await rm(temporaryPrismaRoot, { recursive: true, force: true });
}

console.log(
  'Feature-flag migration test passed: recorded checksums, bounded cutover, fail-closed legacy mutations, exact durable evidence binding, generation retention, explicit reconciliation, and real Prisma deploy verified.',
);
