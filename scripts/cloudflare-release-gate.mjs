#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertProvisioned,
  hasProductionRoute,
  projectRoot,
  readWranglerConfig,
} from './cloudflare-config.mjs';
import {
  extractWorkerRoutes,
  summarizeRouteCoverage,
} from './cloudflare-route-coverage.mjs';

const requireProvisioned = process.argv.includes('--require-provisioned');
const failures = [];
const passes = [];
const source = readWranglerConfig();

function check(condition, label, failure) {
  if (condition) passes.push(label);
  else failures.push(failure);
}

for (const relative of [
  'cloudflare/worker.js',
  'migrations/0001_cloudflare_foundation.sql',
  'functions/api/health.js',
  'functions/api/health/live.js',
  'functions/api/health/ready.js',
]) {
  check(fs.existsSync(path.join(projectRoot, relative)), relative, `Missing ${relative}`);
}

const apiCheck = spawnSync('npm', ['run', 'api:check'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: process.env,
});
check(
  apiCheck.status === 0,
  'Cloudflare API checks pass',
  `api:check failed:\n${apiCheck.stdout ?? ''}${apiCheck.stderr ?? ''}`,
);

const canonicalApi = spawnSync(process.execPath, ['scripts/validate-canonical-api-base.mjs'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: process.env,
});
check(
  canonicalApi.status === 0,
  'Production client base URL is canonical',
  `Canonical API base validation failed:\n${canonicalApi.stdout ?? ''}${canonicalApi.stderr ?? ''}`,
);

const contractMatrix = spawnSync(process.execPath, ['scripts/cloudflare-api-contract-matrix.mjs'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: process.env,
});
check(
  contractMatrix.status === 0,
  'NestJS contract matrix generated',
  `API contract matrix generation failed:\n${contractMatrix.stdout ?? ''}${contractMatrix.stderr ?? ''}`,
);

const contract = JSON.parse(fs.readFileSync(
  path.join(projectRoot, '.artifacts', 'cloudflare', 'api-contract-matrix.json'),
  'utf8',
));
const workerSource = fs.readFileSync(path.join(projectRoot, 'cloudflare', 'worker.js'), 'utf8');
const coverage = summarizeRouteCoverage(
  contract.endpoints,
  extractWorkerRoutes(workerSource),
);
check(
  coverage.complete,
  `${coverage.covered}/${coverage.required} API contracts migrated`,
  [
    `Only ${coverage.covered}/${coverage.required} API contracts are migrated.`,
    `Missing examples: ${coverage.missing.slice(0, 8).join(', ') || 'none'}.`,
    `Unknown Worker routes: ${coverage.unknown.join(', ') || 'none'}.`,
  ].join(' '),
);

check(
  fs.existsSync(path.join(projectRoot, '.artifacts', 'cloudflare', 'rehearsal-2.ok')),
  'Two migration rehearsals recorded',
  'Two successful migration rehearsals have not been recorded.',
);
check(
  fs.existsSync(path.join(projectRoot, '.artifacts', 'cloudflare', 'restore-drill.ok')),
  'Restore drill recorded',
  'A successful D1 restore drill has not been recorded.',
);
check(
  !hasProductionRoute(source),
  'Production route remains detached before cutover',
  'ali.kg/api/* is already attached in wrangler.toml; route attachment must be a separate cutover.',
);

if (requireProvisioned) {
  for (const environment of ['staging', 'review', 'production']) {
    try {
      assertProvisioned(source, environment);
      passes.push(`${environment} D1 provisioned`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
}

console.log('AliStore Cloudflare release gate');
for (const pass of passes) console.log(`✓ ${pass}`);
for (const failure of failures) console.error(`✗ ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
