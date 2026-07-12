#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
  ['API build', 'npm', ['run', 'api:build']],
  ['Web build', 'npm', ['run', 'build', '-w', '@alistore/web']],
  ['Mobile typecheck', 'npm', ['--prefix', 'apps/mobile', 'run', 'typecheck']],
  [
    'Test database reset',
    'npx',
    ['prisma', 'db', 'push', '--schema', 'apps/api/prisma/schema.prisma', '--force-reset', '--accept-data-loss', '--skip-generate'],
    testDatabaseEnv,
  ],
  // Integration suites share one test database and must not clean fixtures concurrently.
  ['API Jest', 'npm', ['run', 'test', '-w', '@alistore/api', '--', '--runInBand'], testDatabaseEnv],
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
  if (!/test/i.test(parsed.pathname)) {
    throw new Error('Refusing to reset a database whose name does not contain "test"');
  }
  if (runtimeEnv.DATABASE_URL && normalizedDatabase(runtimeEnv.DATABASE_URL) === normalizedDatabase(testUrl)) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  }
  return { DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl, E2E_DATABASE_URL: testUrl };
}

function normalizedDatabase(value) {
  const parsed = new URL(value);
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}
