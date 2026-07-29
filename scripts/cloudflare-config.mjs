import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const wranglerPath = path.join(projectRoot, 'wrangler.toml');
export const placeholderDatabaseId = /^00000000-0000-0000-0000-00000000000[1-9]$/;
export const remoteEnvironments = Object.freeze(['staging', 'review', 'production']);

export function readWranglerConfig() {
  return fs.readFileSync(wranglerPath, 'utf8');
}

export function environmentBlock(source, environment) {
  const marker = `[env.${environment}]`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Missing ${marker} in wrangler.toml`);
  const next = source.indexOf('\n[env.', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

export function databaseIdFor(source, environment) {
  const block = environmentBlock(source, environment);
  const match = block.match(/database_id\s*=\s*"([^"]+)"/);
  if (!match) throw new Error(`Missing D1 database_id for ${environment}`);
  return match[1];
}

export function assertProvisioned(source, environment) {
  const databaseId = databaseIdFor(source, environment);
  if (placeholderDatabaseId.test(databaseId)) {
    throw new Error(
      `${environment} D1 is not provisioned: replace placeholder database_id in wrangler.toml`,
    );
  }
  return databaseId;
}

export function hasProductionRoute(source) {
  const block = environmentBlock(source, 'production');
  return /ali\.kg\/api\/\*/.test(block);
}
