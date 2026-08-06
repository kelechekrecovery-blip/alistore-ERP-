import { ChatMessage } from './openrouter-provider';
import type { LlmMessage } from './llm/llm-client';
import type { ResolvedPhoto } from './llm/image-resolver';
import { DeviceGrade } from './valuation';
export interface PhotoEvidence {
    url?: string;
    evidenceId?: string;
    label?: string;
    mimeType?: string;
}
export interface PhotoGradingInput {
    photos: PhotoEvidence[];
    model?: string;
    imei?: string;
    claimedGrade?: DeviceGrade;
    observedDefects?: string[];
}
export interface PhotoGradingResult {
    source: string;
    grade: DeviceGrade;
    confidence: number;
    defects: string[];
    notes: string[];
    recommendedChecks: string[];
}
export declare function gradePhotosByRules(input: PhotoGradingInput): PhotoGradingResult;
export declare const PHOTO_GRADING_SCHEMA: Record<string, unknown>;
export declare function buildVisionGradingMessages(input: PhotoGradingInput, images: ResolvedPhoto[]): LlmMessage[];
export declare function gradingSystemPrompt(): string;
export declare function buildPhotoGradingMessages(input: PhotoGradingInput): ChatMessage[];
export declare function parsePhotoGradingResponse(content: string): Omit<PhotoGradingResult, 'source'>;
