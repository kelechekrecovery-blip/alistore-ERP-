import { ConfigService } from '@nestjs/config';
export interface CriticalAlert {
    source: string;
    message: string;
    error?: unknown;
}
export interface AlertRecord {
    at: string;
    source: string;
    message: string;
    delivered: boolean;
}
export declare class AlerterService {
    private readonly logger;
    readonly enabled: boolean;
    private readonly apiUrl;
    private readonly botToken;
    private readonly chatId;
    private readonly environment;
    private readonly dedupWindowMs;
    private readonly maxPerWindow;
    private readonly lastSentAtByKey;
    private readonly sentAtWindow;
    private readonly recent;
    private suppressed;
    constructor(config: ConfigService);
    notifyCritical(alert: CriticalAlert): void;
    notifyCriticalAndWait(alert: CriticalAlert): Promise<void>;
    recentAlerts(limit?: number): AlertRecord[];
    get suppressedCount(): number;
    private deliver;
    private isDuplicate;
    private isRateCapped;
    private remember;
    private stableMessage;
    private positiveInt;
}
