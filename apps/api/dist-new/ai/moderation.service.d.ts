import { ModerationResult } from './moderation';
export declare class ModerationService {
    private readonly logger;
    moderate(text: string): Promise<ModerationResult>;
}
