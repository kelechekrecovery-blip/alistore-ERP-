import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
export declare class ExpoPushTransport implements NotificationTransport {
    private readonly prisma;
    private readonly apiUrl;
    private readonly accessToken?;
    constructor(config: ConfigService, prisma: PrismaService);
    deliver(message: DeliverableMessage): Promise<void>;
    private resolveTokens;
    private toExpoMessage;
    private disableToken;
}
