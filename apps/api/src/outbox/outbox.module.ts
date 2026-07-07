import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from './outbox.service';
import { OutboxRelay } from './outbox.relay';
import { LogNotificationTransport } from './transports/log.transport';
import { NovuHttpTransport } from './transports/novu.transport';
import { EmailNotificationTransport } from './transports/email.transport';
import { RealtimeNotificationTransport } from './transports/realtime.transport';
import { RealtimeModule } from '../realtime/realtime.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NOTIFICATION_TRANSPORT, NotificationTransport } from './outbox.types';

/**
 * Guaranteed-delivery outbox for notifications/webhooks. Producers inject
 * OutboxService and call enqueueOnTx() inside their audited transaction; the
 * OutboxRelay (pg-boss, opt-in) ships pending messages with retries. Swap the
 * NOTIFICATION_TRANSPORT binding for a Novu/SMS transport without touching
 * producers.
 */
@Module({
  imports: [RealtimeModule],
  providers: [
    OutboxService,
    OutboxRelay,
    // Transport by NOTIFICATION_TRANSPORT: novu (+NOVU_API_KEY) | email | realtime | log.
    {
      provide: NOTIFICATION_TRANSPORT,
      inject: [ConfigService, RealtimeGateway],
      useFactory: (
        config: ConfigService,
        gateway: RealtimeGateway,
      ): NotificationTransport => {
        const mode = config.get<string>('NOTIFICATION_TRANSPORT');
        if (mode === 'novu' && config.get<string>('NOVU_API_KEY')) {
          return new NovuHttpTransport(config);
        }
        if (mode === 'email') {
          return new EmailNotificationTransport(config);
        }
        if (mode === 'realtime') {
          return new RealtimeNotificationTransport(gateway);
        }
        return new LogNotificationTransport();
      },
    },
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
