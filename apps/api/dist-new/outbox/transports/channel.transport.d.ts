import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
import { PrismaService } from '../../prisma/prisma.service';
export declare class ChannelNotificationTransport implements NotificationTransport {
    private readonly email;
    private readonly log;
    private readonly isProduction;
    private readonly expoPush?;
    private readonly fcmPush?;
    private readonly novu?;
    private readonly telegram?;
    private readonly whatsapp?;
    constructor(config: ConfigService, prisma?: PrismaService);
    deliver(message: DeliverableMessage): Promise<void>;
    private fallbackFor;
}
