import { Injectable, Logger } from '@nestjs/common';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';

/**
 * Default transport — logs instead of sending. Replace by rebinding
 * NOTIFICATION_TRANSPORT in OutboxModule (e.g. a Novu or SMS-gateway transport)
 * without changing any producer.
 */
@Injectable()
export class LogNotificationTransport implements NotificationTransport {
  private readonly logger = new Logger('OutboxTransport');

  async deliver(message: DeliverableMessage): Promise<void> {
    this.logger.log(
      `[outbox] ${message.channel} → ${message.recipient} : ${message.template}`,
    );
  }
}
