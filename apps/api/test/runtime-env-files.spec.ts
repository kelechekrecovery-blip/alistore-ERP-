import { resolveRuntimeEnvFiles } from '../src/config/runtime-env-files';

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
});

