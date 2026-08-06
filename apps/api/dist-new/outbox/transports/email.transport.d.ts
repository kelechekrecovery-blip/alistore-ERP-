import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
export declare class EmailNotificationTransport implements NotificationTransport {
    private readonly transporter;
    private readonly from;
    private readonly isProduction;
    private readonly smtpConfigured;
    constructor(config: ConfigService);
    buildMail(message: DeliverableMessage): {
        from: string;
        to: string;
        subject: string;
        text: string;
    };
    deliver(message: DeliverableMessage): Promise<void>;
}
