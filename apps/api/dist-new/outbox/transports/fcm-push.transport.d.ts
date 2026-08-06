import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
export interface FcmMessage {
    token: string;
    notification: {
        title: string;
        body: string;
    };
    data: Record<string, string>;
    android: {
        priority: 'HIGH';
        notification: {
            channel_id: string;
            click_action: string;
        };
    };
}
export interface FcmSendResult {
    ok: boolean;
    status: number;
    code?: string;
}
export interface FcmSender {
    send(message: FcmMessage): Promise<FcmSendResult>;
}
export declare class FcmPushTransport implements NotificationTransport {
    private readonly prisma;
    private readonly sender;
    constructor(config: ConfigService, prisma: PrismaService, sender?: FcmSender);
    deliver(message: DeliverableMessage): Promise<void>;
    private resolveTokens;
    private toMessage;
}
