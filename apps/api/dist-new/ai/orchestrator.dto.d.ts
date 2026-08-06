export declare const AI_READ_TOOLS: readonly ["insights", "pricing_review", "reorder_review", "risk_signals", "support_triage"];
export type AiReadTool = (typeof AI_READ_TOOLS)[number];
export declare class CreateAiRunDto {
    tool: AiReadTool;
    intent: string;
    surface?: string;
    ticketId?: string;
}
