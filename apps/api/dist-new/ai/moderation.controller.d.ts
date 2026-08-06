import { ModerationService } from './moderation.service';
export declare class ModerateDto {
    text: string;
}
export declare class ModerationController {
    private readonly moderation;
    constructor(moderation: ModerationService);
    moderate(dto: ModerateDto): Promise<import("./moderation").ModerationResult>;
}
