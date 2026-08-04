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

