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

const steps = [
  ['Prisma schema validate', 'npx', ['prisma', 'validate', '--schema', 'apps/api/prisma/schema.prisma']],
  ['Prisma client generate', 'npm', ['run', 'prisma:generate', '-w', '@alistore/api']],
  ['API build', 'npm', ['run', 'api:build']],
  ['Web build', 'npm', ['run', 'build', '-w', '@alistore/web']],
  ['Mobile typecheck', 'npm', ['--prefix', 'apps/mobile', 'run', 'typecheck']],
  ['API Jest', 'npm', ['run', 'api:test']],
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

for (const [label, command, commandArgs] of steps) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env,
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
