#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertProvisioned,
  projectRoot,
  readWranglerConfig,
  remoteEnvironments,
} from './cloudflare-config.mjs';

const [action, environment] = process.argv.slice(2);
const allowedActions = new Set(['migrate', 'backup', 'deploy']);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!allowedActions.has(action)) {
  fail(`Unsupported action "${action ?? ''}". Expected migrate, backup, or deploy.`);
}
if (!remoteEnvironments.includes(environment)) {
  fail(`Unsupported environment "${environment ?? ''}". Expected ${remoteEnvironments.join(', ')}.`);
}
if (action === 'backup' && environment !== 'production') {
  fail('The public backup command is intentionally restricted to production.');
}

try {
  assertProvisioned(readWranglerConfig(), environment);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const mutationAllowed = process.env.ALLOW_CLOUDFLARE_REMOTE_MUTATION === '1';
if (!mutationAllowed) {
  fail('Set ALLOW_CLOUDFLARE_REMOTE_MUTATION=1 after reviewing the target environment.');
}

if (environment === 'production') {
  const productionFlag = action === 'migrate'
    ? 'ALLOW_PRODUCTION_D1_MIGRATION'
    : action === 'deploy'
      ? 'ALLOW_PRODUCTION_DEPLOY'
      : 'ALLOW_PRODUCTION_BACKUP';
  if (process.env[productionFlag] !== '1') {
    fail(`Set ${productionFlag}=1 to confirm the production ${action} action.`);
  }
}

let command;
let args;
if (action === 'migrate') {
  command = 'npx';
  args = ['--no-install', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--env', environment, '--remote'];
} else if (action === 'deploy') {
  if (environment === 'production') {
    const gate = spawnSync(
      process.execPath,
      ['scripts/cloudflare-release-gate.mjs', '--require-provisioned'],
      { cwd: projectRoot, stdio: 'inherit', env: process.env },
    );
    if (gate.status !== 0) fail('Production deployment is blocked by release:gate.');
  }
  command = 'npx';
  args = ['--no-install', 'wrangler', 'deploy', '--env', environment, '--strict'];
} else {
  const backupDir = path.join(projectRoot, 'backups', 'd1');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const output = path.join(backupDir, `ali-production-${stamp}.sql`);
  command = 'npx';
  args = ['--no-install', 'wrangler', 'd1', 'export', 'DB', '--env', environment, '--remote', '--output', output];
}

const result = spawnSync(command, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);
