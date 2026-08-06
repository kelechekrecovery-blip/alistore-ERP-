import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

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
