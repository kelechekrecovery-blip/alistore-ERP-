export declare const DEFAULT_TOOL_MAX_ITEMS = 40;
export declare const DEFAULT_TOOL_MAX_CHARS = 12000;
export interface ToolBudget {
    maxItems?: number;
    maxChars?: number;
}
export declare function serializeToolResult(value: unknown, budget?: ToolBudget): string;
