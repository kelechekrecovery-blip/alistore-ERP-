import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import productionWorkerEnvironment from './production-worker-environment.json';

type MutableEnvironment = Record<string, string | undefined>;

function productionWorkerEnvironmentContract() {
  const contract = productionWorkerEnvironment as {
    launchdMarker?: unknown;
    safeOsKeys?: unknown;
    plistIdentityKeys?: unknown;
    forcedEnvironment?: unknown;
  };
  const validKeys = (value: unknown): value is string[] => Array.isArray(value)
    && value.length > 0
    && new Set(value).size === value.length
    && value.every((key) => typeof key === 'string' && /^[A-Z][A-Z0-9_]*$/.test(key));
  if (
    typeof contract.launchdMarker !== 'string'
    || !validKeys(contract.safeOsKeys)
    || !validKeys(contract.plistIdentityKeys)
    || !contract.forcedEnvironment
    || typeof contract.forcedEnvironment !== 'object'
    || Object.entries(contract.forcedEnvironment).some(([key, value]) => (
      !/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== 'string'
    ))
    || (contract.forcedEnvironment as Record<string, string>)[contract.launchdMarker] !== 'true'
    || !contract.plistIdentityKeys.includes('NODE_PATH')
    || !contract.plistIdentityKeys.includes('RENDER_GIT_COMMIT')
    || !contract.plistIdentityKeys.includes('ALISTORE_WORKER_INSTANCE_ID')
    || !contract.plistIdentityKeys.includes('ALISTORE_WORKER_ENV_SNAPSHOT_PATH')
    || !contract.plistIdentityKeys.includes('ALISTORE_WORKER_ENV_SNAPSHOT_SHA256')
  ) {
    throw new Error('Invalid production worker environment contract');
  }
  return {
    launchdMarker: contract.launchdMarker,
    safeOsKeys: contract.safeOsKeys,
    plistIdentityKeys: contract.plistIdentityKeys,
    forcedEnvironment: contract.forcedEnvironment as Record<string, string>,
  };
}

export function isLaunchdManagedWorker(environment: MutableEnvironment): boolean {
  const contract = productionWorkerEnvironmentContract();
  return environment[contract.launchdMarker] === 'true';
}

/**
 * launchd workers must not inherit credentials or database targets from a
 * caller's shell. Preserve only the canonical public OS/identity keys, then
 * force the plist-bound role controls before loading apps/api production files.
 */
export function sanitizeLaunchdWorkerEnvironment(environment: MutableEnvironment): void {
  const contract = productionWorkerEnvironmentContract();
  const preserved = new Map<string, string>();
  for (const key of [...contract.safeOsKeys, ...contract.plistIdentityKeys]) {
    const value = environment[key];
    if (value !== undefined) preserved.set(key, value);
  }
  for (const key of Object.keys(environment)) delete environment[key];
  for (const [key, value] of preserved) environment[key] = value;
  Object.assign(environment, contract.forcedEnvironment);
}

export function loadLaunchdWorkerEnvironmentSnapshot(environment: MutableEnvironment): void {
  const contract = productionWorkerEnvironmentContract();
  const snapshotPath = environment.ALISTORE_WORKER_ENV_SNAPSHOT_PATH;
  const expectedHash = environment.ALISTORE_WORKER_ENV_SNAPSHOT_SHA256;
  sanitizeLaunchdWorkerEnvironment(environment);
  if (!snapshotPath || !expectedHash || !/^[0-9a-f]{64}$/i.test(expectedHash)) {
    throw new Error('Production worker environment snapshot identity is invalid');
  }
  let content: Buffer;
  try {
    content = readFileSync(snapshotPath);
  } catch {
    throw new Error('Production worker environment snapshot is unavailable');
  }
  const actualHash = createHash('sha256').update(content).digest('hex');
  if (actualHash !== expectedHash.toLowerCase()) {
    throw new Error('Production worker environment snapshot integrity verification failed');
  }
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error('Production worker environment snapshot is invalid');
  }
  if (
    !snapshot
    || Array.isArray(snapshot)
    || typeof snapshot !== 'object'
    || Object.entries(snapshot).some(([key, value]) => (
      !/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== 'string'
    ))
  ) {
    throw new Error('Production worker environment snapshot is invalid');
  }
  const publicIdentity = Object.fromEntries(contract.plistIdentityKeys.map((key) => [
    key,
    environment[key],
  ]));
  Object.assign(environment, snapshot, publicIdentity, contract.forcedEnvironment);
}

export function resolveRuntimeEnvFiles(
  nodeEnv: string | undefined,
): string[] {
  const mode = nodeEnv?.trim().toLowerCase();
  if (mode === 'production') {
    return ['.env.production.local', '.env.production'];
  }
  if (mode === 'test') {
    return ['.env.test.local', '.env.test', '.env'];
  }
  return ['.env.local', '.env'];
}

/**
 * Keep the standalone production preflight aligned with the API/worker runtime.
 * Explicit non-production-shaped files remain single-file fixtures for CI and
 * local diagnostics.
 */
export function resolveProductionPreflightEnvFiles(envFile: string): string[] {
  if (basename(envFile) !== '.env.production') return [envFile];
  return [join(dirname(envFile), '.env.production.local'), envFile];
}

type RuntimeEnvFileLoader = {
  exists: (path: string) => boolean;
  load: (path: string) => void;
};

const defaultRuntimeEnvFileLoader: RuntimeEnvFileLoader = {
  exists: existsSync,
  load: (path) => {
    dotenv.config({ path, override: false });
  },
};

/**
 * Load runtime configuration before production preflight runs. Both the API
 * and worker entrypoints must use this path so local supervised deployments
 * behave the same way as platforms that inject every variable directly.
 */
export function preloadRuntimeEnvFiles(
  nodeEnv: string | undefined,
  loader: RuntimeEnvFileLoader = defaultRuntimeEnvFileLoader,
): void {
  for (const envFile of resolveRuntimeEnvFiles(nodeEnv)) {
    if (!loader.exists(envFile)) continue;
    loader.load(envFile);
  }
}
