#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot } from './cloudflare-config.mjs';

const source = process.env.ALISTORE_D1_BACKUP_FILE;
if (!source) {
  console.error('✗ ALISTORE_D1_BACKUP_FILE must point to an exported D1 SQL backup.');
  process.exit(1);
}
const resolved = path.resolve(source);
if (!fs.existsSync(resolved)) {
  console.error(`✗ Backup does not exist: ${resolved}`);
  process.exit(1);
}

const stateDir = path.join(projectRoot, '.artifacts', 'cloudflare', 'restore-state');
fs.mkdirSync(stateDir, { recursive: true });
const result = spawnSync('npx', [
  '--no-install', 'wrangler', 'd1', 'execute', 'DB', '--env', 'local', '--local',
  '--persist-to', stateDir, '--file', resolved,
], { cwd: projectRoot, stdio: 'inherit', env: process.env });
if (result.status !== 0) process.exit(result.status ?? 1);

console.log('✓ Backup restored into isolated local D1 state.');
console.log('  Run reconciliation before recording .artifacts/cloudflare/restore-drill.ok.');
