import { CampaignFunnelDto } from './attribution.dto';
import { CampaignAttributionService } from './campaign-attribution.service';
export declare class CampaignTrackingController {
    private readonly attribution;
    constructor(attribution: CampaignAttributionService);
    track(dto: CampaignFunnelDto): Promise<{
        accepted: boolean;
        recorded: boolean;
    }>;
}
