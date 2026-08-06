import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
export declare class WhatsAppCloudTransport implements NotificationTransport {
    private readonly apiUrl;
    private readonly apiVersion;
    private readonly accessToken;
    private readonly phoneNumberId;
    constructor(config: ConfigService);
    deliver(message: DeliverableMessage): Promise<void>;
}
