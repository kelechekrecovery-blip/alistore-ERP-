import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmChatOptions,
  LlmChatResult,
  LlmClient,
  LlmContent,
  LlmMessage,
  LlmToolDef,
} from './llm-client';

/** Default model — the most capable Opus tier. High-volume paths override per-call. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
/** Safety bound on the agentic tool loop so a misbehaving model can't spin forever. */
const MAX_TOOL_ITERATIONS = 6;

export interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * Anthropic (Claude) implementation of the LLM port. Supports vision (base64 image
 * blocks), structured output (schema-validated JSON via `output_config.format`), an
 * agentic tool loop, and prompt caching of the system prefix. The key stays server-side
 * (SDK reads it from here, never logged, never returned to the client).
 */
export class AnthropicLlmClient implements LlmClient {
  readonly supportsVision = true;
  readonly supportsTools = true;
  readonly supportsStructuredOutput = true;
  readonly source: string;

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicClientOptions) {
    this.model = opts.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
    this.source = `anthropic:${this.model}`;
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  async chat(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<LlmChatResult> {
    const model = opts.model?.trim() || this.model;
    const source = `anthropic:${model}`;
    const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    const system = opts.system ? buildSystem(opts.system, opts.cacheSystem) : undefined;
    const anthropicMessages = messages.map(toAnthropicMessage);

    if (opts.tools?.length) {
      const text = await this.runToolLoop({ model, maxTokens, system, tools: opts.tools }, anthropicMessages);
      return { text, source };
    }

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      messages: anthropicMessages,
      ...(system ? { system } : {}),
      ...(opts.jsonSchema ? { output_config: { format: { type: 'json_schema', schema: opts.jsonSchema } } } : {}),
    };
    const res = await this.client.messages.create(params);
    const text = textOf(res);
    if (opts.jsonSchema) {
      // Structured output guarantees the reply is schema-valid JSON — parse it, but never
      // throw here: a caller-side tolerant parser/rule fallback handles any edge case.
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      return { text, parsed, source };
    }
    return { text, source };
  }

  /**
   * Agentic tool loop: call the model, execute any tool it requests server-side, feed the
   * results back, and repeat until it answers (or the iteration bound trips, after which we
   * force a final answer with tools removed).
   */
  private async runToolLoop(
    base: {
      model: string;
      maxTokens: number;
      system?: Anthropic.TextBlockParam[];
      tools: LlmToolDef[];
    },
    initial: Anthropic.MessageParam[],
  ): Promise<string> {
    const tools: Anthropic.Tool[] = base.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
    const messages: Anthropic.MessageParam[] = [...initial];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
      const res = await this.client.messages.create({
        model: base.model,
        max_tokens: base.maxTokens,
        messages,
        tools,
        ...(base.system ? { system: base.system } : {}),
      });
      if (res.stop_reason !== 'tool_use') return textOf(res);

      messages.push({ role: 'assistant', content: res.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue;
        const def = base.tools.find((t) => t.name === block.name);
        const result = await runTool(def, block.name, block.input);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result.content, is_error: result.isError });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Bound reached — ask once more without tools so the model must produce an answer.
    const finalRes = await this.client.messages.create({
      model: base.model,
      max_tokens: base.maxTokens,
      messages,
      ...(base.system ? { system: base.system } : {}),
    });
    return textOf(finalRes);
  }
}

async function runTool(
  def: LlmToolDef | undefined,
  name: string,
  input: unknown,
): Promise<{ content: string; isError: boolean }> {
  if (!def) return { content: `unknown tool: ${name}`, isError: true };
  try {
    return { content: await def.run(input), isError: false };
  } catch (err) {
    return { content: `tool «${name}» failed: ${String(err)}`, isError: true };
  }
}

function buildSystem(text: string, cache?: boolean): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text, ...(cache ? { cache_control: { type: 'ephemeral' } } : {}) }];
}

function toAnthropicMessage(message: LlmMessage): Anthropic.MessageParam {
  return { role: message.role, content: toAnthropicContent(message.content) };
}

function toAnthropicContent(content: LlmContent): Anthropic.MessageParam['content'] {
  if (typeof content === 'string') return content;
  return content.map((block) =>
    block.type === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: block.mediaType, data: block.dataBase64 } }
      : { type: 'text', text: block.text },
  );
}

/** Join the text blocks of a response into a single trimmed string. */
function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
