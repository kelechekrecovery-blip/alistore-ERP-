import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { MetricsService } from './metrics.service';
export declare class MetricsController {
    private readonly metrics;
    private readonly config;
    constructor(metrics: MetricsService, config: ConfigService);
    getMetrics(request: Request): string;
    private assertAccess;
}
