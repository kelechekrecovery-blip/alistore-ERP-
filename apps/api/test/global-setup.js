const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const { config } = require('dotenv');

const MIGRATION_TIMEOUT_MS = 120_000;
const PG_CONNECT_TIMEOUT_MS = 5_000;
const PG_QUERY_TIMEOUT_MS = 10_000;
const FORBIDDEN_ROUTING_PARAMETERS = [
  'host',
  'hostaddr',
  'port',
  'database',
  'dbname',
  'user',
  'password',
  'service',
  'options',
];

/**
 * Give every Jest process its own PostgreSQL schema and apply the complete
 * forward-only migration history before any suite starts.
 *
 * No shared schema is reset. Concurrent Jest runs therefore cannot erase each
 * other's fixtures, and a stale manually altered test schema is irrelevant.
 */
module.exports = async function globalSetup() {
  const knownDatabaseUrls = [];
  try {
    await setupIsolatedSchema(knownDatabaseUrls);
  } catch (error) {
    const diagnostic = error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
      : String(error);
    throw new Error(
      `Isolated API test database setup failed:\n${redactSensitiveOutput(
        diagnostic,
        knownDatabaseUrls,
      )}`,
    );
  }
};

async function setupIsolatedSchema(knownDatabaseUrls) {
  const apiRoot = path.resolve(__dirname, '..');
  if (process.env.ALISTORE_EVIDENCE_MODE !== '1') {
    config({ path: path.join(apiRoot, '.env') });
  }

  const baseTestDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!baseTestDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for API tests');
  }
  knownDatabaseUrls.push(baseTestDatabaseUrl);
  assertIsolatedTestDatabase(baseTestDatabaseUrl, process.env.DATABASE_URL);

  const schemaName = `alistore_jest_${process.pid}_${randomBytes(6).toString('hex')}`;
  const runDatabaseUrl = withSchema(baseTestDatabaseUrl, schemaName);
  const adminDatabaseUrl = withoutSchema(baseTestDatabaseUrl);
  knownDatabaseUrls.push(runDatabaseUrl, adminDatabaseUrl);
  await createSchema(adminDatabaseUrl, schemaName);

  try {
    await assertPgSearchPath(runDatabaseUrl, schemaName);
    const prismaCli = require.resolve('prisma/build/index.js', { paths: [apiRoot] });
    runCommand(
      'Prisma migrations',
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--schema', path.join(apiRoot, 'prisma/schema.prisma')],
      {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: runDatabaseUrl },
      },
      [baseTestDatabaseUrl, runDatabaseUrl],
    );
    const postdeployDatabaseUrl = withPgSearchPath(baseTestDatabaseUrl, schemaName);
    runCommand(
      'post-deploy indexes',
      process.execPath,
      [path.join(apiRoot, 'scripts/postdeploy-indexes.mjs')],
      {
        cwd: apiRoot,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: postdeployDatabaseUrl,
          DIRECT_DATABASE_URL: postdeployDatabaseUrl,
        },
      },
      [baseTestDatabaseUrl, runDatabaseUrl, postdeployDatabaseUrl],
    );
    // Prove the migrated schema rejects every destructive Event Ledger
    // statement before the ordinary suites are allowed to use it.
    const auditProbeIds = await assertAuditEventImmutability(postdeployDatabaseUrl, schemaName);
    // The disposable Jest schema is owned by the lifecycle/admin test user and
    // 88 legacy suites scope-clean their fixtures with auditEvent.deleteMany().
    // Disable only this exact trigger in this exact generated test schema after
    // its migration contract has passed. No runtime GUC or production bypass is
    // installed in the database function itself.
    await disableAuditEventGuardForDisposableSchema(postdeployDatabaseUrl, schemaName, auditProbeIds);
  } catch (error) {
    try {
      await dropSchema(adminDatabaseUrl, schemaName);
    } catch (cleanupError) {
      const primary = error instanceof Error ? error.message : String(error);
      const cleanup = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      throw new Error(`${primary}\nCleanup also failed: ${cleanup}`);
    }
    throw error;
  }

  // Jest propagates environment changes made by globalSetup to test workers.
  process.env.TEST_DATABASE_URL = runDatabaseUrl;
  global.__ALISTORE_JEST_SCHEMA__ = {
    adminDatabaseUrl,
    schemaName,
  };
}

function runCommand(label, command, args, options, databaseUrls) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: MIGRATION_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status === 0 && !result.error) return;

  const diagnostic = [
    `status=${String(result.status)}`,
    `signal=${String(result.signal)}`,
    result.error?.message,
    result.stdout,
    result.stderr,
  ].filter(Boolean).join('\n');
  throw new Error(
    `Failed to apply ${label} to isolated API test schema:\n${redactSensitiveOutput(
      diagnostic,
      databaseUrls,
    )}`,
  );
}

function assertIsolatedTestDatabase(testDatabaseUrl, configuredDatabaseUrl) {
  assertNoRoutingOverrides(testDatabaseUrl, 'TEST_DATABASE_URL');
  const parsed = new URL(testDatabaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error(
      `TEST_DATABASE_URL must target an explicitly named test database; got ${databaseName}`,
    );
  }
  if (configuredDatabaseUrl) {
    assertNoRoutingOverrides(configuredDatabaseUrl, 'DATABASE_URL');
    if (databaseTarget(configuredDatabaseUrl) === databaseTarget(testDatabaseUrl)) {
      throw new Error(
        'TEST_DATABASE_URL must target a different database from DATABASE_URL',
      );
    }
  }
}

function assertNoRoutingOverrides(value, label) {
  const url = new URL(value);
  const forbidden = FORBIDDEN_ROUTING_PARAMETERS.filter((key) => url.searchParams.has(key));
  if (forbidden.length > 0) {
    throw new Error(
      `${label} must express its database target in the URL authority; forbidden query parameters: ${forbidden.join(', ')}`,
    );
  }
  return false;
}

function databaseTarget(value) {
  const url = new URL(value);
  const protocol = url.protocol === 'postgres:' ? 'postgresql:' : url.protocol;
  const hostname = normalizeHostname(url.hostname);
  const port = url.port || '5432';
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return `${protocol}//${hostname}:${port}/${database}`;
}

function normalizeHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (['localhost', '127.0.0.1', '::1'].includes(normalized)) return 'loopback';
  return normalized.replace(/\.$/, '');
}

function withSchema(databaseUrl, schemaName) {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schemaName);
  url.searchParams.set('options', `-c search_path=${schemaName}`);
  return url.toString();
}

function withPgSearchPath(databaseUrl, schemaName) {
  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  url.searchParams.set('options', `-c search_path=${schemaName}`);
  return url.toString();
}

function withoutSchema(databaseUrl) {
  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  url.searchParams.delete('options');
  return url.toString();
}

async function createSchema(databaseUrl, schemaName) {
  const client = createLifecycleClient(databaseUrl);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
  } finally {
    await client.end();
  }
}

async function dropSchema(databaseUrl, schemaName) {
  const client = createLifecycleClient(databaseUrl);
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await client.end();
  }
}

async function assertPgSearchPath(databaseUrl, schemaName) {
  const client = createLifecycleClient(databaseUrl);
  await client.connect();
  try {
    const result = await client.query('SELECT current_schema() AS schema');
    if (result.rows[0]?.schema !== schemaName) {
      throw new Error(
        `node-postgres search_path is not isolated to the generated Jest schema`,
      );
    }
  } finally {
    await client.end();
  }
}

async function assertAuditEventImmutability(databaseUrl, schemaName) {
  assertGeneratedJestSchema(schemaName);
  const client = createLifecycleClient(databaseUrl);
  const eventId = `immutability-probe-${process.pid}-${randomBytes(6).toString('hex')}`;
  await client.connect();
  try {
    const trigger = await client.query(
      `SELECT t.tgenabled, pg_get_triggerdef(t.oid) AS definition
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1
         AND c.relname = 'AuditEvent'
         AND t.tgname = 'AuditEvent_immutable_guard'
         AND NOT t.tgisinternal`,
      [schemaName],
    );
    const definition = trigger.rows[0]?.definition ?? '';
    if (trigger.rowCount !== 1
      || trigger.rows[0]?.tgenabled !== 'O'
      || !/BEFORE/.test(definition)
      || !['UPDATE', 'DELETE', 'TRUNCATE'].every((event) => definition.includes(event))) {
      throw new Error('AuditEvent immutable trigger is missing UPDATE/DELETE/TRUNCATE coverage');
    }

    await client.query(
      `INSERT INTO "AuditEvent" ("id", "type", "actor", "payload", "refs")
       VALUES ($1, 'audit.immutability_probe', 'jest:migration-gate', '{}'::jsonb, ARRAY[]::text[])`,
      [eventId],
    );
    await expectSqlState55000(client, `UPDATE "AuditEvent" SET "actor" = 'tampered' WHERE "id" = $1`, [eventId]);
    await expectSqlState55000(client, `DELETE FROM "AuditEvent" WHERE "id" = $1`, [eventId]);
    await expectSqlState55000(client, 'TRUNCATE TABLE "AuditEvent"');

    const unchanged = await client.query(
      `SELECT "type", "actor" FROM "AuditEvent" WHERE "id" = $1`,
      [eventId],
    );
    if (unchanged.rowCount !== 1
      || unchanged.rows[0]?.type !== 'audit.immutability_probe'
      || unchanged.rows[0]?.actor !== 'jest:migration-gate') {
      throw new Error('AuditEvent immutability probe row changed after rejected statements');
    }
    const compensationId = `${eventId}-compensation`;
    await client.query(
      `INSERT INTO "AuditEvent" ("id", "type", "actor", "payload", "refs")
       VALUES ($1, 'audit.immutability_compensated', 'jest:migration-gate', $2::jsonb, ARRAY[$3]::text[])`,
      [compensationId, JSON.stringify({ corrects: eventId }), eventId],
    );
    return [eventId, compensationId];
  } finally {
    await client.end();
  }
}

async function expectSqlState55000(client, text, values = []) {
  try {
    await client.query(text, values);
  } catch (error) {
    if (error?.code === '55000' && /AuditEvent is append-only/.test(error.message ?? '')) return;
    throw error;
  }
  throw new Error(`Expected AuditEvent mutation to fail with SQLSTATE 55000: ${text}`);
}

async function disableAuditEventGuardForDisposableSchema(databaseUrl, schemaName, probeIds) {
  assertGeneratedJestSchema(schemaName);
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error(`Refusing to disable AuditEvent guard outside an explicit test database: ${databaseName}`);
  }
  const client = createLifecycleClient(databaseUrl);
  await client.connect();
  try {
    const state = await client.query(
      `SELECT t.tgenabled
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1
         AND c.relname = 'AuditEvent'
         AND t.tgname = 'AuditEvent_immutable_guard'
         AND NOT t.tgisinternal`,
      [schemaName],
    );
    if (state.rowCount !== 1 || state.rows[0]?.tgenabled !== 'O') {
      throw new Error('Refusing test bypass because AuditEvent immutable trigger is missing or disabled');
    }
    await client.query(
      `ALTER TABLE "${schemaName}"."AuditEvent" DISABLE TRIGGER "AuditEvent_immutable_guard"`,
    );
    const removed = await client.query(
      `DELETE FROM "${schemaName}"."AuditEvent" WHERE "id" = ANY($1::text[])`,
      [probeIds],
    );
    if (removed.rowCount !== probeIds.length) {
      throw new Error('AuditEvent migration probes were not removed exactly after guarded test disable');
    }
    const remaining = await client.query(
      `SELECT count(*)::int AS count FROM "${schemaName}"."AuditEvent" WHERE "id" = ANY($1::text[])`,
      [probeIds],
    );
    if (remaining.rows[0]?.count !== 0) {
      throw new Error('AuditEvent migration probes remain in the disposable Jest schema');
    }
  } finally {
    await client.end();
  }
}

function assertGeneratedJestSchema(schemaName) {
  if (!/^alistore_jest_[0-9]+_[a-f0-9]{12}$/.test(schemaName)) {
    throw new Error('Refusing AuditEvent lifecycle operation for an unexpected Jest schema');
  }
}

function createLifecycleClient(connectionString) {
  return new Client({
    connectionString,
    connectionTimeoutMillis: PG_CONNECT_TIMEOUT_MS,
    query_timeout: PG_QUERY_TIMEOUT_MS,
    statement_timeout: PG_QUERY_TIMEOUT_MS,
    lock_timeout: PG_CONNECT_TIMEOUT_MS,
  });
}

function redactSensitiveOutput(output, databaseUrls) {
  let redacted = String(output)
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(
      /([?&](?:password|sslpassword|token|secret|key)=)[^&\s'"]+/gi,
      '$1[REDACTED]',
    );
  for (const databaseUrl of databaseUrls) {
    let parsed;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      continue;
    }
    const secrets = [
      parsed.username,
      parsed.password,
      decodeURIComponent(parsed.username),
      decodeURIComponent(parsed.password),
      ...Array.from(parsed.searchParams.values()),
    ].filter(Boolean);
    redacted = redacted.split(databaseUrl).join('[REDACTED_DATABASE_URL]');
    for (const secret of secrets) {
      redacted = redacted.split(secret).join('[REDACTED]');
      redacted = redacted.split(encodeURIComponent(secret)).join('[REDACTED]');
    }
  }
  return redacted.trim().slice(-8_000);
}

module.exports.__test = {
  assertIsolatedTestDatabase,
  assertNoRoutingOverrides,
  databaseTarget,
  redactSensitiveOutput,
};
