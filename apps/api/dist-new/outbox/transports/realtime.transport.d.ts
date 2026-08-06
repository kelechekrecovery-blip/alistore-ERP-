import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
export declare class RealtimeNotificationTransport implements NotificationTransport {
    private readonly gateway;
    constructor(gateway: RealtimeGateway);
    deliver(message: DeliverableMessage): Promise<void>;
}
