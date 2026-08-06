import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

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
