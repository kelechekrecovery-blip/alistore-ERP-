import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './analytics.dto';
export declare class AnalyticsController {
    private readonly analytics;
    constructor(analytics: AnalyticsService);
    track(dto: TrackEventDto): Promise<{
        ok: true;
    }>;
}
