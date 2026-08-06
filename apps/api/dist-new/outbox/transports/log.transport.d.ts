import { DeliverableMessage, NotificationTransport } from '../outbox.types';
export declare class LogNotificationTransport implements NotificationTransport {
    private readonly logger;
    deliver(message: DeliverableMessage): Promise<void>;
}
