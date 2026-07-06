import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxRelay } from './outbox.relay';
import { LogNotificationTransport } from './transports/log.transport';
import { NOTIFICATION_TRANSPORT } from './outbox.types';

/**
 * Guaranteed-delivery outbox for notifications/webhooks. Producers inject
 * OutboxService and call enqueueOnTx() inside their audited transaction; the
 * OutboxRelay (pg-boss, opt-in) ships pending messages with retries. Swap the
 * NOTIFICATION_TRANSPORT binding for a Novu/SMS transport without touching
 * producers.
 */
@Module({
  providers: [
    OutboxService,
    OutboxRelay,
    { provide: NOTIFICATION_TRANSPORT, useClass: LogNotificationTransport },
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
