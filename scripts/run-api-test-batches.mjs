#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = join(process.cwd(), 'apps', 'api');
// The integration suites intentionally use a shared database but do not all
// clean every related aggregate. Keep one file per process by default so a
// suite cannot inherit fixtures or open handles from a sibling suite.
const batchSize = Number(process.env.API_JEST_BATCH_SIZE ?? 1);
if (!Number.isInteger(batchSize) || batchSize < 1) {
  throw new Error('API_JEST_BATCH_SIZE must be a positive integer');
}
const retries = Number(process.env.API_JEST_RETRIES ?? 1);
if (!Number.isInteger(retries) || retries < 0) {
  throw new Error('API_JEST_RETRIES must be a non-negative integer');
}

function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (/\.(e2e-)?spec\.ts$/.test(entry.name)) files.push(relative(process.cwd(), path));
  }
  return files.sort();
}

const files = collect(root);
if (files.length === 0) throw new Error('No API Jest files found');

function run(command, args, label) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

const batches = [];
for (let index = 0; index < files.length; index += batchSize) {
  batches.push(files.slice(index, index + batchSize));
}

console.log(`API Jest isolated gate: ${files.length} files in ${batches.length} clean processes (batch size ${batchSize}, retries ${retries})`);
for (const [index, batch] of batches.entries()) {
  let status = 1;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const suffix = attempt === 0 ? '' : ` retry ${attempt}/${retries}`;
    status = run('npx', [
      'prisma', 'migrate', 'reset',
      '--schema', 'apps/api/prisma/schema.prisma',
      '--force', '--skip-seed', '--skip-generate',
    ], `API database reset ${index + 1}/${batches.length}${suffix}`);
    if (status !== 0) break;

    status = run('npm', [
      'run', 'test', '-w', '@alistore/api', '--', '--runInBand', ...batch,
    ], `API Jest batch ${index + 1}/${batches.length}${suffix}`);
    if (status === 0) break;
    if (attempt < retries) {
      console.warn(`\nAPI batch ${index + 1}/${batches.length} failed; resetting and retrying once.`);
    }
  }
  if (status !== 0) {
    console.error(`\nAPI batch failed after ${retries + 1} attempt(s): API Jest batch ${index + 1}/${batches.length}`);
    process.exit(status);
  }
}

console.log(`\nAPI Jest isolated gate passed: ${files.length}/${files.length} test files.`);
