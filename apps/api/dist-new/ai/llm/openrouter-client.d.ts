import { OpenRouterOptions } from '../openrouter-provider';
import type { LlmChatOptions, LlmChatResult, LlmClient, LlmMessage } from './llm-client';
export declare class OpenRouterLlmClient implements LlmClient {
    readonly supportsVision: boolean;
    readonly supportsTools = false;
    readonly supportsStructuredOutput: boolean;
    readonly source: string;
    private readonly opts;
    private readonly model;
    constructor(opts: OpenRouterOptions);
    chat(messages: LlmMessage[], opts?: LlmChatOptions): Promise<LlmChatResult>;
    private request;
}
