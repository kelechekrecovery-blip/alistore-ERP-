import { PrismaService } from '../prisma/prisma.service';
import { AlerterService } from './alerter.service';
import { ErrorReporter } from './error-reporter';
import { MetricsService } from './metrics.service';
export declare class StatusController {
    private readonly prisma;
    private readonly metrics;
    private readonly alerter;
    private readonly reporter;
    constructor(prisma: PrismaService, metrics: MetricsService, alerter: AlerterService, reporter: ErrorReporter);
    status(): Promise<{
        api: {
            startedAt: string;
            uptimeSeconds: number;
            requestsTotal: number;
            errors5xxTotal: number;
            status: string;
        };
        sentry: {
            enabled: boolean;
        };
        alerting: {
            enabled: boolean;
            suppressedCount: number;
            recent: import("./alerter.service").AlertRecord[];
        };
        outbox: {
            pending: number;
            failed: number;
            oldestPendingAgeSeconds: number | null;
        };
        workers: {
            id: string;
            lastSeenAt: string;
            ageSeconds: number;
            stale: boolean;
        }[];
    }>;
}
