import { AnthropicLlmClient } from './anthropic-client';
import type { LlmClient } from './llm-client';
import { OpenRouterLlmClient } from './openrouter-client';

export type EnvReader = (name: string) => string | undefined;

const defaultEnv: EnvReader = (name) => process.env[name];

function read(env: EnvReader, name: string): string | undefined {
  const value = env(name);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Single place that decides which LLM provider (if any) backs the AI layer, replacing the
 * `AI_PROVIDER_KEY ?? OPENROUTER_API_KEY` check duplicated across services.
 *
 * `AI_PROVIDER` selects the provider: `anthropic`, `openrouter`, or `auto` (default —
 * prefer Anthropic when its key is present, else OpenRouter). Returns `null` when no key
 * is configured, in which case callers use their keyless rule engine. Keys are read
 * server-side only.
 */
export function resolveLlmClient(env: EnvReader = defaultEnv): LlmClient | null {
  const provider = (read(env, 'AI_PROVIDER') ?? 'auto').toLowerCase();
  const anthropicKey = read(env, 'ANTHROPIC_API_KEY');
  const openRouterKey = read(env, 'AI_PROVIDER_KEY') ?? read(env, 'OPENROUTER_API_KEY');

  const anthropic = () =>
    anthropicKey ? new AnthropicLlmClient({ apiKey: anthropicKey, model: read(env, 'ANTHROPIC_MODEL') }) : null;
  const openRouter = () =>
    openRouterKey ? new OpenRouterLlmClient({ apiKey: openRouterKey, model: read(env, 'AI_MODEL') }) : null;

  if (provider === 'anthropic') return anthropic();
  if (provider === 'openrouter') return openRouter();
  return anthropic() ?? openRouter();
}

/**
 * Model override for a specific surface (e.g. a cheaper model on high-volume paths).
 * Reads `AI_FAST_MODEL` for categorize/describe; falls through to the client default.
 */
export function fastModel(env: EnvReader = defaultEnv): string | undefined {
  return read(env, 'AI_FAST_MODEL');
}
