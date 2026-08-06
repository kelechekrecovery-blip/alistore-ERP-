import {
  preloadRuntimeEnvFiles,
  resolveRuntimeEnvFiles,
} from '../src/config/runtime-env-files';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Runtime environment files', () => {
  it('loads only production-specific files in production', () => {
    expect(resolveRuntimeEnvFiles('production')).toEqual([
      '.env.production.local',
      '.env.production',
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
});
