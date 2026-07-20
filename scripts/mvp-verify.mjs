#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const skipE2e = args.has('--skip-e2e');
const strictExternal = args.has('--strict-external');
const env = { ...process.env, ...loadEnvFile('apps/api/.env') };
if (!env.E2E_DATABASE_URL && env.TEST_DATABASE_URL) {
  env.E2E_DATABASE_URL = env.TEST_DATABASE_URL;
}
const testDatabaseEnv = testDatabaseOverride(env);

const steps = [
  ['Prisma schema validate', 'npx', ['prisma', 'validate', '--schema', 'apps/api/prisma/schema.prisma']],
  ['Prisma client generate', 'npm', ['run', 'prisma:generate', '-w', '@alistore/api']],
  ['Refund migration upgrade path', 'npm', ['run', 'test:refund-migration-upgrade', '-w', '@alistore/api'], testDatabaseEnv],
  ['Inventory roll-forward migration upgrade path', 'npm', ['run', 'test:inventory-roll-forward-migration-upgrade', '-w', '@alistore/api'], testDatabaseEnv],
  ['Exchange migration upgrade path', 'npm', ['run', 'test:exchange-migration-upgrade', '-w', '@alistore/api'], testDatabaseEnv],
  ['Order payment-mode migration upgrade path', 'npm', ['run', 'test:order-payment-mode-migration-upgrade', '-w', '@alistore/api'], testDatabaseEnv],
  ['API build', 'npm', ['run', 'api:build']],
  ['Web build', 'npm', ['run', 'build', '-w', '@alistore/web']],
  // NOTE: there is deliberately no mobile step here. The gate used to typecheck
  // apps/mobile — the DEPRECATED Expo monolith — which is not a release artifact,
  // while the four iOS and four Android release targets went unchecked. A green
  // gate therefore proved nothing about anything that actually ships. Native
  // builds belong in their own workflow (macOS runner for xcodebuild, Android SDK
  // for gradlew), not in this Postgres-bound release gate.
  [
    'Test database reset',
    'npx',
    ['prisma', 'migrate', 'reset', '--schema', 'apps/api/prisma/schema.prisma', '--force', '--skip-seed', '--skip-generate'],
    testDatabaseEnv,
  ],
  ['Test database post-deploy indexes', 'node', ['apps/api/scripts/postdeploy-indexes.mjs'], testDatabaseEnv],
  // Integration suites share one test database and must not clean fixtures concurrently.
  ['API Jest batches', 'node', ['scripts/run-api-test-batches.mjs'], testDatabaseEnv],
];

if (!skipE2e) {
  steps.push(['Playwright E2E', 'npm', ['run', 'e2e']]);
}

steps.push([
  strictExternal ? 'External readiness (strict)' : 'External readiness (report)',
  'npm',
  [
    'run',
    'readiness',
    '-w',
    '@alistore/api',
    ...(strictExternal ? ['--', '--strict-external'] : []),
  ],
]);

for (const [label, command, commandArgs, stepEnv] of steps) {
  console.log(`\n==> ${label}`);
  if (label === 'Playwright E2E') {
    // A previous interrupted `next dev` can leave a valid manifest pointing at
    // deleted Turbopack chunks. E2E owns this generated directory exclusively.
    rmSync(resolve(process.cwd(), 'apps/web/.next-e2e'), { recursive: true, force: true });
  }
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: { ...env, ...(stepEnv ?? {}) },
    shell: false,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`\nMVP verification failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nMVP verification complete.');
if (!strictExternal) {
  console.log('External provider/hardware readiness is reported above; use --strict-external to fail on missing production credentials.');
}

function loadEnvFile(path) {
  const fullPath = resolve(process.cwd(), path);
  if (!existsSync(fullPath)) return {};
  const loaded = {};
  for (const line of readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    loaded[key] = unquote(rawValue.trim());
  }
  return loaded;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function testDatabaseOverride(runtimeEnv) {
  const testUrl = runtimeEnv.TEST_DATABASE_URL ?? runtimeEnv.E2E_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is required for mvp:verify');
  }
  const parsed = new URL(testUrl);
  const databaseName = parsed.pathname.replace(/^\/+/, '');
  if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error('Refusing to reset a database whose name does not contain a standalone "test" segment');
  }
  if (runtimeEnv.DATABASE_URL && normalizedDatabase(runtimeEnv.DATABASE_URL) === normalizedDatabase(testUrl)) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  }
  if (runtimeEnv.ALISTORE_TEST_DATABASE_CONFIRMED !== '1') {
    throw new Error('Set ALISTORE_TEST_DATABASE_CONFIRMED=1 to confirm the destructive test database reset');
  }
  // Each isolated Jest process owns one suite, but Prisma's default pool can
  // still reserve many idle connections. Keep the destructive verification
  // gate bounded and prevent a developer's long-running API from starving it.
  const boundedTestUrl = withConnectionLimit(testUrl, 5);
  return {
    DATABASE_URL: boundedTestUrl,
    TEST_DATABASE_URL: boundedTestUrl,
    E2E_DATABASE_URL: boundedTestUrl,
    ALISTORE_TEST_DATABASE_CONFIRMED: runtimeEnv.ALISTORE_TEST_DATABASE_CONFIRMED,
  };
}

function withConnectionLimit(value, limit) {
  const url = new URL(value);
  url.searchParams.set('connection_limit', String(limit));
  return url.toString();
}

function normalizedDatabase(value) {
  const parsed = new URL(value);
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}
