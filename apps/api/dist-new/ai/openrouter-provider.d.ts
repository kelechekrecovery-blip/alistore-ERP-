import { Insight } from './insight';
import { InsightContext, InsightProvider } from './insight-provider';
export interface ChatMessage {
    role: 'system' | 'user';
    content: string;
}
export declare function buildInsightMessages(ctx: InsightContext): ChatMessage[];
export declare function parseInsightsResponse(content: string): Insight[];
export interface OpenRouterOptions {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
}
export declare function openRouterChat(messages: ChatMessage[], cfg: OpenRouterOptions): Promise<string>;
export declare class OpenRouterInsightProvider implements InsightProvider {
    readonly source: string;
    private readonly model;
    private readonly opts;
    constructor(opts: OpenRouterOptions);
    generate(ctx: InsightContext): Promise<Insight[]>;
}
