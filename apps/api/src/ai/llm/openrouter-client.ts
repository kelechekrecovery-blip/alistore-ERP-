import { ChatMessage, openRouterChat, OpenRouterOptions } from '../openrouter-provider';
import type { LlmChatOptions, LlmChatResult, LlmClient, LlmMessage } from './llm-client';

const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

/**
 * OpenRouter implementation of the LLM port — a thin adapter over the existing
 * `openRouterChat` transport. Text-only: image blocks and tools are not supported (the
 * shared transport sends `content: string`), so `supportsVision`/`supportsTools` are
 * false and callers degrade or fall back to rules. Kept as the fallback provider so the
 * pre-Anthropic behaviour still works when only an OpenRouter key is configured.
 */
export class OpenRouterLlmClient implements LlmClient {
  readonly supportsVision = false;
  readonly supportsTools = false;
  readonly supportsStructuredOutput = false;
  readonly source: string;

  private readonly opts: OpenRouterOptions;
  private readonly model: string;

  constructor(opts: OpenRouterOptions) {
    this.opts = opts;
    this.model = opts.model?.trim() || DEFAULT_OPENROUTER_MODEL;
    this.source = `openrouter:${this.model}`;
  }

  async chat(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<LlmChatResult> {
    const chatMessages: ChatMessage[] = [];
    if (opts.system) chatMessages.push({ role: 'system', content: opts.system });
    for (const message of messages) chatMessages.push({ role: 'user', content: flatten(message.content) });

    const model = opts.model?.trim() || this.model;
    const text = await openRouterChat(chatMessages, { ...this.opts, model });
    return { text, source: `openrouter:${model}` };
  }
}

/** Collapse multimodal content to text — images are dropped (OpenRouter path is text-only). */
function flatten(content: LlmMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((block) => (block.type === 'text' ? block.text : '[изображение недоступно текстовому провайдеру]'))
    .join('\n');
}
