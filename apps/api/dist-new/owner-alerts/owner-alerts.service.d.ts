import { PrismaService } from '../prisma/prisma.service';
export declare const OWNER_ALERT_TEMPLATE = "owner_alert";
export interface OwnerAlertSweepResult {
    alerted: number;
    skipped: number;
}
export declare class OwnerAlertsService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    sweep(windowHours?: number): Promise<OwnerAlertSweepResult>;
    private toAlert;
}
