import { OpenRouterOptions } from '../openrouter-provider';
import type { LlmChatOptions, LlmChatResult, LlmClient, LlmMessage } from './llm-client';

const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 800;

/** OpenAI-compatible message payload (string or multimodal content parts). */
type OpenAiContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAiContentPart[];
}

/**
 * OpenRouter implementation of the LLM port — a first-class provider, not a text-only
 * fallback. Talks the OpenAI-compatible chat/completions API directly, which gives us:
 *   - vision via `image_url` data-URL content parts (e.g. gpt-4o-mini is multimodal);
 *   - structured output via `response_format: { type: 'json_schema', ... }`.
 * The agentic tool loop stays off (`supportsTools = false`) — that path remains
 * Anthropic-only. On any transport/model error the caller falls back to keyless rules.
 * The key stays server-side and is never logged.
 */
export class OpenRouterLlmClient implements LlmClient {
  readonly supportsVision: boolean;
  readonly supportsTools = false;
  readonly supportsStructuredOutput: boolean;
  readonly source: string;

  private readonly opts: OpenRouterOptions;
  private readonly model: string;

  constructor(opts: OpenRouterOptions) {
    this.opts = opts;
    this.model = opts.model?.trim() || DEFAULT_OPENROUTER_MODEL;
    const capabilities = capabilitiesForModel(this.model);
    this.supportsVision = capabilities.vision;
    this.supportsStructuredOutput = capabilities.structuredOutput;
    this.source = `openrouter:${this.model}`;
  }

  async chat(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<LlmChatResult> {
    if (opts.tools?.length) throw new Error('openrouter client does not support the tool loop');
    const model = opts.model?.trim() || this.model;
    const payloadMessages: OpenAiMessage[] = [];
    if (opts.system) payloadMessages.push({ role: 'system', content: opts.system });
    for (const message of messages) payloadMessages.push({ role: message.role, content: toOpenAiContent(message.content) });

    const body = {
      model,
      messages: payloadMessages,
      temperature: 0.3,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(opts.jsonSchema
        ? { response_format: { type: 'json_schema', json_schema: { name: 'result', strict: true, schema: opts.jsonSchema } } }
        : {}),
    };

    let text: string;
    try {
      text = await this.request(body);
    } catch (error) {
      if (!opts.jsonSchema) throw error;
      const { response_format: _ignored, ...plainBody } = body;
      text = await this.request(plainBody);
    }
    if (opts.jsonSchema) {
      // json_schema mode returns schema-valid JSON; parse defensively — the caller-side
      // tolerant parser / rules fallback covers any provider that ignores response_format.
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      return { text, parsed, source: `openrouter:${model}` };
    }
    return { text, source: `openrouter:${model}` };
  }

  private async request(body: Record<string, unknown>): Promise<string> {
    const baseUrl = this.opts.baseUrl ?? DEFAULT_BASE_URL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
          'X-Title': 'AliStore ERP',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`openrouter responded ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('openrouter response has no content');
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}

function capabilitiesForModel(model: string): { vision: boolean; structuredOutput: boolean } {
  const normalized = model.toLowerCase();
  const vision = [
    /(^|\/)gpt-4o(?:-|$)/,
    /(^|\/)gpt-4\.1(?:-|$)/,
    /(^|\/)gemini(?:-|\/)/,
    /(^|\/)claude(?:-|\/)/,
    /(^|\/)(?:qwen[^/]*vl|llava|pixtral)(?:-|\/|$)/,
  ].some((pattern) => pattern.test(normalized));
  const structuredOutput = [
    /(^|\/)gpt-4o(?:-|$)/,
    /(^|\/)gpt-4\.1(?:-|$)/,
    /(^|\/)gemini(?:-|\/)/,
    /(^|\/)claude(?:-|\/)/,
  ].some((pattern) => pattern.test(normalized));
  return { vision, structuredOutput };
}

/** Map port content to OpenAI parts; images become base64 data-URLs. */
function toOpenAiContent(content: LlmMessage['content']): string | OpenAiContentPart[] {
  if (typeof content === 'string') return content;
  return content.map((block) =>
    block.type === 'image'
      ? { type: 'image_url', image_url: { url: `data:${block.mediaType};base64,${block.dataBase64}` } }
      : { type: 'text', text: block.text },
  );
}
