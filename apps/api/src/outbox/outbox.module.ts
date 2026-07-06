import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from './outbox.service';
import { OutboxRelay } from './outbox.relay';
import { LogNotificationTransport } from './transports/log.transport';
import { NovuHttpTransport } from './transports/novu.transport';
import { NOTIFICATION_TRANSPORT, NotificationTransport } from './outbox.types';

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
    // Novu when configured (NOTIFICATION_TRANSPORT=novu + NOVU_API_KEY), else log.
    {
      provide: NOTIFICATION_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): NotificationTransport =>
        config.get<string>('NOTIFICATION_TRANSPORT') === 'novu' &&
        config.get<string>('NOVU_API_KEY')
          ? new NovuHttpTransport(config)
          : new LogNotificationTransport(),
    },
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
