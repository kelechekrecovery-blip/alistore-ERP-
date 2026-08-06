import { ReportsService } from '../reports/reports.service';
import { Insight } from './insight';
import { PricingService } from './pricing.service';
import { ReorderService } from './reorder.service';
export declare class InsightsService {
    private readonly reports;
    private readonly pricing;
    private readonly reorder;
    private readonly logger;
    private readonly fallback;
    private readonly client;
    constructor(reports: ReportsService, pricing: PricingService, reorder: ReorderService);
    insights(): Promise<{
        source: string;
        insights: Insight[];
    }>;
    private generateWithLlm;
    private buildTools;
    private buildContext;
}
