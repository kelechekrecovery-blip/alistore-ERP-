import type { LlmMessage } from './llm/llm-client';
export interface CategorySuggestion {
    category: string;
    confidence: number;
    matched: string[];
    alternatives: {
        category: string;
        score: number;
    }[];
}
export declare function suggestCategory(name: string, attrs?: Record<string, unknown>): CategorySuggestion;
export declare const CATEGORY_NAMES: string[];
export declare const CATEGORIZE_SCHEMA: Record<string, unknown>;
export declare const CATEGORIZE_SYSTEM: string;
export declare function buildCategorizeMessages(name: string, attrs?: Record<string, unknown>): LlmMessage[];
export declare function coerceCategorySuggestion(parsed: unknown): CategorySuggestion | null;
