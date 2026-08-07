import {
  isLaunchdManagedWorker,
  loadLaunchdWorkerEnvironmentSnapshot,
  preloadRuntimeEnvFiles,
  resolveProductionPreflightEnvFiles,
  resolveRuntimeEnvFiles,
  sanitizeLaunchdWorkerEnvironment,
} from '../src/config/runtime-env-files';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Runtime environment files', () => {
  it('loads only production-specific files in production', () => {
    expect(resolveRuntimeEnvFiles('production')).toEqual([
      '.env.production.local',
      '.env.production',
    ]);
  });

  it('gives production preflight the same local-first file precedence as runtime', () => {
    expect(resolveProductionPreflightEnvFiles('/srv/api/.env.production')).toEqual([
      '/srv/api/.env.production.local',
      '/srv/api/.env.production',
    ]);
    expect(resolveProductionPreflightEnvFiles('/tmp/rehearsal.env')).toEqual([
      '/tmp/rehearsal.env',
    ]);
  });

  it('keeps local development overrides outside production', () => {
    expect(resolveRuntimeEnvFiles('development')).toEqual([
      '.env.local',
      '.env',
    ]);
    expect(resolveRuntimeEnvFiles(undefined)).toEqual([
      '.env.local',
      '.env',
    ]);
  });

  it('isolates tests from production and developer-local secrets', () => {
    expect(resolveRuntimeEnvFiles('test')).toEqual([
      '.env.test.local',
      '.env.test',
      '.env',
    ]);
  });

  it('preloads only existing production files in precedence order', () => {
    const checked: string[] = [];
    const loaded: string[] = [];

    preloadRuntimeEnvFiles('production', {
      exists: (path) => {
        checked.push(path);
        return path === '.env.production';
      },
      load: (path) => loaded.push(path),
    });

    expect(checked).toEqual(['.env.production.local', '.env.production']);
    expect(loaded).toEqual(['.env.production']);
  });

  it('keeps process values above local and production file values', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alistore-runtime-env-'));
    const previousCwd = process.cwd();
    const key = 'ALISTORE_RUNTIME_ENV_PRECEDENCE_TEST';
    const previousValue = process.env[key];

    try {
      writeFileSync(join(directory, '.env.production.local'), `${key}=local\n`);
      writeFileSync(join(directory, '.env.production'), `${key}=production\n`);
      process.chdir(directory);

      process.env[key] = 'injected';
      preloadRuntimeEnvFiles('production');
      expect(process.env[key]).toBe('injected');

      delete process.env[key];
      preloadRuntimeEnvFiles('production');
      expect(process.env[key]).toBe('local');
    } finally {
      process.chdir(previousCwd);
      if (previousValue === undefined) delete process.env[key];
      else process.env[key] = previousValue;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('sanitizes only explicitly marked launchd workers without changing managed runtime semantics', () => {
    const managed = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://render-injected',
      JWT_SECRET: 'render-secret',
    };
    expect(isLaunchdManagedWorker(managed)).toBe(false);
    expect(managed).toEqual({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://render-injected',
      JWT_SECRET: 'render-secret',
    });

    const launchd: Record<string, string | undefined> = {
      ALISTORE_LAUNCHD_MANAGED: 'true',
      HOME: '/Users/operator',
      DATABASE_URL: 'postgresql://shell-must-not-win',
      DIRECT_DATABASE_URL: 'postgresql://shell-direct-must-not-win',
      JWT_SECRET: 'shell-must-not-win',
      NODE_PATH: '/release/node_modules',
      RENDER_GIT_COMMIT: 'a'.repeat(40),
      ALISTORE_WORKER_INSTANCE_ID: 'public-instance',
      PROCESS_ROLE: 'api',
      REFUND_RELAY_ENABLED: 'true',
    };
    expect(isLaunchdManagedWorker(launchd)).toBe(true);
    sanitizeLaunchdWorkerEnvironment(launchd);

    expect(launchd.DATABASE_URL).toBeUndefined();
    expect(launchd.DIRECT_DATABASE_URL).toBeUndefined();
    expect(launchd.JWT_SECRET).toBeUndefined();
    expect(launchd.HOME).toBe('/Users/operator');
    expect(launchd.NODE_PATH).toBe('/release/node_modules');
    expect(launchd.PROCESS_ROLE).toBe('worker');
    expect(launchd.REFUND_RELAY_ENABLED).toBe('false');
    expect(launchd.NODE_ENV).toBe('production');
  });

  it('verifies a launchd snapshot and re-forces public role and identity controls', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alistore-worker-snapshot-'));
    const snapshotPath = join(directory, 'snapshot.json');
    const content = JSON.stringify({
      DATABASE_URL: 'postgresql://snapshot',
      APPLE_PRIVATE_KEY: 'line-one\nline-two',
      PROCESS_ROLE: 'api',
      RENDER_GIT_COMMIT: 'snapshot-must-not-win',
    });
    writeFileSync(snapshotPath, content);
    const environment: Record<string, string | undefined> = {
      ALISTORE_LAUNCHD_MANAGED: 'true',
      ALISTORE_WORKER_ENV_SNAPSHOT_PATH: snapshotPath,
      ALISTORE_WORKER_ENV_SNAPSHOT_SHA256: createHash('sha256').update(content).digest('hex'),
      NODE_PATH: '/release/node_modules',
      RENDER_GIT_COMMIT: 'a'.repeat(40),
      ALISTORE_WORKER_INSTANCE_ID: 'public-instance',
      DATABASE_URL: 'postgresql://ambient-must-not-win',
    };
    try {
      loadLaunchdWorkerEnvironmentSnapshot(environment);
      expect(environment.DATABASE_URL).toBe('postgresql://snapshot');
      expect(environment.APPLE_PRIVATE_KEY).toBe('line-one\nline-two');
      expect(environment.PROCESS_ROLE).toBe('worker');
      expect(environment.RENDER_GIT_COMMIT).toBe('a'.repeat(40));
      expect(environment.NODE_PATH).toBe('/release/node_modules');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a tampered launchd snapshot before runtime bootstrap', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alistore-worker-snapshot-tamper-'));
    const snapshotPath = join(directory, 'snapshot.json');
    writeFileSync(snapshotPath, '{"DATABASE_URL":"original"}');
    const environment: Record<string, string | undefined> = {
      ALISTORE_LAUNCHD_MANAGED: 'true',
      ALISTORE_WORKER_ENV_SNAPSHOT_PATH: snapshotPath,
      ALISTORE_WORKER_ENV_SNAPSHOT_SHA256: 'f'.repeat(64),
      NODE_PATH: '/release/node_modules',
      RENDER_GIT_COMMIT: 'a'.repeat(40),
      ALISTORE_WORKER_INSTANCE_ID: 'public-instance',
    };
    try {
      expect(() => loadLaunchdWorkerEnvironmentSnapshot(environment)).toThrow(
        'snapshot integrity verification failed',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
