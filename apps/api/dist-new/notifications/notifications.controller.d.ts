import type { AuthPrincipal } from '../auth/jwt.strategy';
import { NotificationsService } from './notifications.service';
import { RegisterPushTokenDto } from './push-token.dto';
export declare class NotificationsController {
    private readonly notifications;
    constructor(notifications: NotificationsService);
    registerPushToken(dto: RegisterPushTokenDto, user: AuthPrincipal): Promise<{
        id: string;
        token: string;
        platform: string;
        deviceId: string;
        scope: string;
        customerId: string | null;
        staffId: string | null;
        enabled: boolean;
        lastSeenAt: string;
    }>;
    mine(user: AuthPrincipal, limit?: string): Promise<{
        symbol: string;
        id: string;
        createdAt: Date;
        customerId: string;
        route: string;
        template: string;
        title: string;
        detail: string;
        referenceId: string | null;
        readAt: Date | null;
    }[]>;
    markRead(user: AuthPrincipal, id: string): Promise<{
        symbol: string;
        id: string;
        createdAt: Date;
        customerId: string;
        route: string;
        template: string;
        title: string;
        detail: string;
        referenceId: string | null;
        readAt: Date | null;
    }>;
    private requireCustomer;
}
