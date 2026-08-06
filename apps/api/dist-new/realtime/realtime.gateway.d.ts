import { Server, Socket } from 'socket.io';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { AuthService } from '../auth/auth.service';
import { AuthzService } from '../authz/authz.service';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { PrismaService } from '../prisma/prisma.service';
type RealtimeSocket = Socket & {
    data: {
        principal?: AuthPrincipal;
    };
};
export declare class RealtimeGateway {
    private readonly auth?;
    private readonly prisma?;
    private readonly staffAuth?;
    private readonly authz?;
    server: Server;
    constructor(auth?: AuthService | undefined, prisma?: PrismaService | undefined, staffAuth?: StaffAuthService | undefined, authz?: AuthzService | undefined);
    afterInit(server: Server): void;
    subscribeOrder(client: RealtimeSocket, orderId: string): Promise<{
        subscribed: string;
    }>;
    emitOrderStatus(orderId: string, status: string, payload?: Record<string, unknown>): void;
    private readToken;
    private assertStaffQueueAccess;
}
export {};
