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
const mutationSetting = 'alistore.feature_flag_mutation_contract';
const mutationContract = 'generation-v2';
const pauseLockKey = 2_608_060_005;
const recordedMigrationSha256 = 'dc4d83a41462d1cc14897ef37a83b5d44575fe04d084d030b7e3c77662bd2472';
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

const recordedSql = await readFile(
  path.join(migrationsRoot, recordedMigration, 'migration.sql'),
  'utf8',
);
assert.equal(
  createHash('sha256').update(recordedSql).digest('hex'),
  recordedMigrationSha256,
  `${recordedMigration} must remain byte-for-byte identical to acf243d2`,
);

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

const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const databaseNames = {
  cutover: `alistore_test_feature_flag_cutover_${suffix}`,
  reconciliation: `alistore_test_feature_flag_reconciliation_${suffix}`,
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
    /^alistore_test_feature_flag_(cutover|reconciliation|deploy)_\d+_[a-z0-9]+$/,
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
  timestampOffset = 0,
}) {
  await db.query(`
    INSERT INTO "AuditEvent" (id, type, actor, ts, payload, refs)
    VALUES (
      $1,
      'feature_flag.changed',
      $2,
      TIMESTAMP '2026-08-06 00:00:00' + ($3 * INTERVAL '1 second'),
      jsonb_build_object(
        'key', $4::TEXT,
        'reason', $5::TEXT,
        'after', jsonb_build_object('source', $6::TEXT)
      ),
      ARRAY[$4]::TEXT[]
    )
  `, [id, actor, timestampOffset, key, reason, sourceName]);
}

async function insertAuditHistory(db, key, count, {
  finalSource = 'database',
  finalReason = `Revision ${count}`,
  actor = 'old-image',
} = {}) {
  for (let revision = 1; revision <= count; revision += 1) {
    await insertAuditEvent(db, {
      id: `${key}-event-${revision}`,
      key,
      sourceName: revision === count ? finalSource : 'database',
      reason: revision === count ? finalReason : `Historical revision ${revision}`,
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

  const verified = clientFor(databaseName);
  await verified.connect();
  try {
    const migrationRecords = await verified.query(`
      SELECT migration_name, finished_at IS NOT NULL AS finished
      FROM _prisma_migrations
      WHERE migration_name IN ($1, $2)
      ORDER BY migration_name
    `, [recordedMigration, repairMigration]);
    assert.deepEqual(migrationRecords.rows, [
      { migration_name: recordedMigration, finished: true },
      { migration_name: repairMigration, finished: true },
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
  'Feature-flag generation migration test passed: bounded ACCESS EXCLUSIVE cutover, fail-closed legacy mutations, explicit reconciliation, and recorded Prisma deploy verified.',
);
