import { PrismaService } from '../prisma/prisma.service';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import type { RegisterPushTokenDto } from './push-token.dto';
export declare class NotificationsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    registerPushToken(dto: RegisterPushTokenDto, user?: AuthPrincipal): Promise<{
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
    listMine(customerId: string, limit?: number): Promise<{
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
    markRead(id: string, customerId: string): Promise<{
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
    private resolveBinding;
    private assertTokenOwnership;
}
