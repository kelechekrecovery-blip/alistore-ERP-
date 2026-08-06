import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
export declare class TelegramBotTransport implements NotificationTransport {
    private readonly apiUrl;
    private readonly botToken;
    private readonly timeoutMs;
    constructor(config: ConfigService);
    deliver(message: DeliverableMessage): Promise<void>;
}
