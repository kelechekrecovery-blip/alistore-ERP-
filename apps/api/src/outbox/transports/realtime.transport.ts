import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';

/**
 * Delivers outbox messages as live socket.io pushes: `recipient` is the order id
 * (room), `template` the status. Makes the RealtimeGateway a real outbox channel
 * for in-app order/courier updates.
 */
@Injectable()
export class RealtimeNotificationTransport implements NotificationTransport {
  constructor(private readonly gateway: RealtimeGateway) {}

  async deliver(message: DeliverableMessage): Promise<void> {
    const payload =
      message.payload && typeof message.payload === 'object'
        ? (message.payload as Record<string, unknown>)
        : {};
    this.gateway.emitOrderStatus(message.recipient, message.template, payload);
  }
}
