import { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { OutboxService } from './outbox.service';
export declare class OutboxController {
    private readonly outbox;
    private readonly staffAuth;
    constructor(outbox: OutboxService, staffAuth: StaffAuthService);
    redrive(user: AuthPrincipal, id: string): Promise<{
        id: string;
        payload: import("@prisma/client/runtime/library").JsonValue;
        status: import(".prisma/client").$Enums.OutboxStatus;
        createdAt: Date;
        channel: string;
        attempts: number;
        recipient: string;
        template: string;
        processingToken: string | null;
        lastError: string | null;
        nextAttemptAt: Date | null;
        sentAt: Date | null;
        campaignId: string | null;
    }>;
}
