import { InsightsService } from './insights.service';
export declare class InsightsController {
    private readonly insights;
    constructor(insights: InsightsService);
    get(): Promise<{
        source: string;
        insights: import("./insight").Insight[];
    }>;
}
