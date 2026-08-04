import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const AI_READ_TOOLS = ['insights', 'pricing_review', 'reorder_review', 'risk_signals', 'support_triage'] as const;
export type AiReadTool = (typeof AI_READ_TOOLS)[number];

export class CreateAiRunDto {
  @IsIn(AI_READ_TOOLS)
  tool!: AiReadTool;

  @IsString()
  @MaxLength(120)
  intent!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  surface?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ticketId?: string;
}
