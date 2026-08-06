import type { LlmChatOptions, LlmChatResult, LlmClient, LlmMessage } from './llm-client';
export declare const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
export interface AnthropicClientOptions {
    apiKey: string;
    model?: string;
    timeoutMs?: number;
}
export declare class AnthropicLlmClient implements LlmClient {
    readonly supportsVision = true;
    readonly supportsTools = true;
    readonly supportsStructuredOutput = true;
    readonly source: string;
    private readonly client;
    private readonly model;
    constructor(opts: AnthropicClientOptions);
    chat(messages: LlmMessage[], opts?: LlmChatOptions): Promise<LlmChatResult>;
    private runToolLoop;
}
