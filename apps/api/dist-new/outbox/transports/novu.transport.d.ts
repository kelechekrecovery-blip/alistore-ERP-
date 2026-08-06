import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
export declare class NovuHttpTransport implements NotificationTransport {
    private readonly apiUrl;
    private readonly apiKey;
    constructor(config: ConfigService);
    deliver(message: DeliverableMessage): Promise<void>;
}
