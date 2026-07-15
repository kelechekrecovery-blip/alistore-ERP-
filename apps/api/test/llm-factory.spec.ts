import { resolveLlmClient, fastModel, EnvReader } from '../src/ai/llm/llm.factory';

/** Env reader over a plain map — keeps the factory tests hermetic (no process.env). */
const envOf =
  (map: Record<string, string | undefined>): EnvReader =>
  (name) =>
    map[name];

describe('resolveLlmClient', () => {
  it('returns null when no provider key is configured (keyless rule engines run)', () => {
    expect(resolveLlmClient(envOf({}))).toBeNull();
  });

  it('prefers Anthropic in auto mode when its key is present', () => {
    const client = resolveLlmClient(envOf({ ANTHROPIC_API_KEY: 'sk-ant', OPENROUTER_API_KEY: 'or' }));
    expect(client?.source).toBe('anthropic:claude-opus-4-8');
    expect(client?.supportsVision).toBe(true);
    expect(client?.supportsStructuredOutput).toBe(true);
  });

  it('falls back to OpenRouter in auto mode when only its key is present', () => {
    const client = resolveLlmClient(envOf({ AI_PROVIDER_KEY: 'or-key', AI_MODEL: 'x/y' }));
    expect(client?.source).toBe('openrouter:x/y');
    expect(client?.supportsVision).toBe(false);
    expect(client?.supportsStructuredOutput).toBe(false);
  });

  it('honours an explicit ANTHROPIC_MODEL override', () => {
    const client = resolveLlmClient(envOf({ ANTHROPIC_API_KEY: 'sk-ant', ANTHROPIC_MODEL: 'claude-haiku-4-5' }));
    expect(client?.source).toBe('anthropic:claude-haiku-4-5');
  });

  it('AI_PROVIDER=openrouter ignores an Anthropic key', () => {
    const client = resolveLlmClient(
      envOf({ AI_PROVIDER: 'openrouter', ANTHROPIC_API_KEY: 'sk-ant', OPENROUTER_API_KEY: 'or' }),
    );
    expect(client?.source.startsWith('openrouter:')).toBe(true);
  });

  it('AI_PROVIDER=anthropic without an Anthropic key returns null (does not silently use OpenRouter)', () => {
    expect(resolveLlmClient(envOf({ AI_PROVIDER: 'anthropic', OPENROUTER_API_KEY: 'or' }))).toBeNull();
  });

  it('fastModel reads AI_FAST_MODEL', () => {
    expect(fastModel(envOf({ AI_FAST_MODEL: 'claude-haiku-4-5' }))).toBe('claude-haiku-4-5');
    expect(fastModel(envOf({}))).toBeUndefined();
  });
});
