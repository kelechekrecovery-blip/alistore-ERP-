export interface LlmTextBlock {
    type: 'text';
    text: string;
}
export interface LlmImageBlock {
    type: 'image';
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    dataBase64: string;
}
export type LlmContent = string | Array<LlmTextBlock | LlmImageBlock>;
export interface LlmMessage {
    role: 'user' | 'assistant';
    content: LlmContent;
}
export interface LlmToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    run(input: unknown): Promise<string>;
}
export interface LlmChatOptions {
    system?: string;
    jsonSchema?: Record<string, unknown>;
    tools?: LlmToolDef[];
    cacheSystem?: boolean;
    maxTokens?: number;
    model?: string;
}
export interface LlmChatResult {
    text: string;
    parsed?: unknown;
    source: string;
}
export interface LlmClient {
    readonly source: string;
    readonly supportsVision: boolean;
    readonly supportsTools: boolean;
    readonly supportsStructuredOutput: boolean;
    chat(messages: LlmMessage[], opts?: LlmChatOptions): Promise<LlmChatResult>;
}
export declare function isAnthropic(client: Pick<LlmClient, 'source'>): boolean;
