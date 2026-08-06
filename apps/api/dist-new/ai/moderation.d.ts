import type { LlmMessage } from './llm/llm-client';
export interface ModerationResult {
    allowed: boolean;
    categories: string[];
    reason: string;
    source: string;
}
export declare function moderateByRules(text: string): ModerationResult;
export declare const MODERATION_SCHEMA: Record<string, unknown>;
export declare const MODERATION_SYSTEM: string;
export declare function buildModerationMessages(text: string): LlmMessage[];
export declare function coerceModeration(parsed: unknown, source: string): ModerationResult | null;
