import { PrismaService } from '../prisma/prisma.service';
import { TrackEventDto } from './analytics.dto';
export interface FunnelStage {
    productViews: number;
    addToCarts: number;
    checkoutsStarted: number;
}
export interface FunnelCounts extends FunnelStage {
    from: string;
    to: string;
    bySource: Record<string, FunnelStage>;
}
export declare class AnalyticsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    record(dto: TrackEventDto): Promise<void>;
    funnel(from: Date, to: Date): Promise<FunnelCounts>;
    get eventTypes(): readonly string[];
}
