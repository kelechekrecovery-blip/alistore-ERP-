import { ModerationService } from '../ai/moderation.service';
type CampaignCreativeCopy = {
    creativeHeadline?: string | null;
    creativeBody?: string | null;
    creativeCtaLabel?: string | null;
};
export declare class CampaignCreativePolicyService {
    private readonly moderation;
    constructor(moderation: ModerationService);
    assertAllowed(input: CampaignCreativeCopy): Promise<void>;
}
export {};
