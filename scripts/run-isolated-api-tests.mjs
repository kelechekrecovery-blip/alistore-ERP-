#!/usr/bin/env node
/**
 * Run the API suite against a private database cloned from a template.
 *
 * Why this exists
 * ---------------
 * Every API run shares `alistore_test`, and the suites clean up with bare
 * `deleteMany()` — 1207 calls across 114 of 202 spec files, 73 of which wipe
 * AuditEvent outright. Two runs at once (two agents, two terminals, CI on the
 * same database) therefore corrupt each other: one run's cleanup lands between
 * another's `findFirst` and its `FOR UPDATE`, and unrelated suites go red. Red
 * from that is noise, not a defect, which is exactly what makes it expensive —
 * you cannot tell the two apart without re-running serially.
 *
 * Why a database and not a schema
 * -------------------------------
 * The earlier isolation spike proposed a schema per worker. That does not
 * isolate `pg_advisory_xact_lock`, which is database-scoped, not schema-scoped:
 * 78 call sites in apps/api/src, four of them on static global keys. Runs in
 * separate schemas of one database would still queue behind each other's locks,
 * which is precisely what the concurrency suites exercise. A separate database
 * isolates the locks too.
 *
 * Why a template
 * --------------
 * `CREATE DATABASE ... TEMPLATE` is a file copy: it reproduces the schema
 * including the 33 triggers that seven migrations create in custom SQL. Building
 * each run's database with `prisma db push` instead would silently omit all of
 * them — measured: 0 of 33 triggers, 20 phantom failures. The template is built
 * once with `migrate deploy` + postdeploy-indexes and reused until the migration
 * count changes.
 *
 * Usage
 *   node scripts/run-isolated-api-tests.mjs [--keep] [jest args…]
 *   node scripts/run-isolated-api-tests.mjs --testPathPattern reports-money-truth
 *
 * --keep leaves the run database in place for post-mortem inspection.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Client } = require(require.resolve('pg', { paths: [path.join(repoRoot, 'apps/api'), repoRoot] }));

const TEMPLATE_DB = process.env.ALISTORE_TEST_TEMPLATE_DB ?? 'alistore_test_template';
const ADMIN_DB = process.env.ALISTORE_TEST_ADMIN_DB ?? 'postgres';

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const jestArgs = argv.filter((arg) => arg !== '--keep');

/** Base connection string, with the database name replaced per call. */
function urlFor(database) {
  const base = process.env.TEST_DATABASE_URL
    ?? process.env.DATABASE_URL
    ?? 'postgresql://alistore@localhost:5432/alistore_test?schema=public';
  const url = new URL(base);
  url.pathname = `/${database}`;
  url.search = '?schema=public';
  return url.toString();
}

async function admin(sql, values) {
  const client = new Client({ connectionString: urlFor(ADMIN_DB) });
  await client.connect();
  try {
    return await client.query(sql, values);
  } finally {
    await client.end();
  }
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function migrationCount() {
  return readdirSync(path.join(repoRoot, 'apps/api/prisma/migrations'))
    .filter((entry) => /^\d/.test(entry)).length;
}

/**
 * The template is rebuilt when its applied-migration count no longer matches the
 * migrations on disk. That is a coarse check, but it fails in the safe direction:
 * a missing migration always changes the count, and a rebuild costs one migrate
 * deploy.
 */
async function ensureTemplate() {
  const expected = migrationCount();
  const exists = await admin('SELECT 1 FROM pg_database WHERE datname = $1', [TEMPLATE_DB]);
  let applied = -1;
  if (exists.rowCount) {
    const client = new Client({ connectionString: urlFor(TEMPLATE_DB) });
    await client.connect();
    try {
      const rows = await client.query(
        'SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL',
      );
      applied = rows.rows[0].n;
    } catch {
      applied = -1;
    } finally {
      await client.end();
    }
  }
  if (applied === expected) {
    console.log(`[isolated] шаблон ${TEMPLATE_DB} актуален (${applied} миграций)`);
    return;
  }

  console.log(`[isolated] пересобираю шаблон ${TEMPLATE_DB}: применено ${applied}, на диске ${expected}`);
  await admin(`DROP DATABASE IF EXISTS "${TEMPLATE_DB}" WITH (FORCE)`);
  await admin(`CREATE DATABASE "${TEMPLATE_DB}"`);
  const env = { DATABASE_URL: urlFor(TEMPLATE_DB) };
  let status = run('npm', ['exec', '-w', '@alistore/api', '--', 'prisma', 'migrate', 'deploy'], env);
  if (status !== 0) throw new Error('prisma migrate deploy на шаблоне упал');
  status = run('node', ['apps/api/scripts/postdeploy-indexes.mjs'], env);
  if (status !== 0) throw new Error('postdeploy-indexes на шаблоне упал');
}

/** Drop run databases left behind by crashed runs; skip any that still have backends. */
async function dropOrphans() {
  const orphans = await admin(`
    SELECT d.datname FROM pg_database d
    WHERE d.datname LIKE 'alistore\\_test\\_run\\_%'
      AND NOT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname)
  `);
  for (const { datname } of orphans.rows) {
    await admin(`DROP DATABASE IF EXISTS "${datname}"`);
    console.log(`[isolated] убрал осиротевшую ${datname}`);
  }
}

async function main() {
  // The name must keep `test` as a separate word: setup-env.ts:22 and
  // e2e/helpers.ts:135 both refuse to touch a database without it, and that
  // refusal is the last thing standing between a typo and the dev database.
  const runDb = `alistore_test_run_${process.pid}_${process.hrtime.bigint().toString(36).slice(-6)}`;

  await dropOrphans();
  await ensureTemplate();

  console.log(`[isolated] создаю ${runDb} из шаблона`);
  await admin(`CREATE DATABASE "${runDb}" TEMPLATE "${TEMPLATE_DB}"`);

  let status = 1;
  try {
    status = run('npm', ['run', 'test', '-w', '@alistore/api', '--', '--runInBand', ...jestArgs], {
      TEST_DATABASE_URL: urlFor(runDb),
      ALISTORE_TEST_DATABASE_CONFIRMED: '1',
    });
  } finally {
    if (keep) {
      console.log(`[isolated] оставляю ${runDb} (--keep): ${urlFor(runDb)}`);
    } else {
      await admin(`DROP DATABASE IF EXISTS "${runDb}" WITH (FORCE)`);
      console.log(`[isolated] удалил ${runDb}`);
    }
  }
  process.exit(status);
}

main().catch((error) => {
  console.error(`[isolated] ${error.message}`);
  process.exit(1);
});
