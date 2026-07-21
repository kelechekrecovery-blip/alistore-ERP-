import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { OutboxService } from './outbox.service';
import { OutboxController } from './outbox.controller';
import { OutboxRelay } from './outbox.relay';
import { LogNotificationTransport } from './transports/log.transport';
import { selectNotificationTransport } from './notification-transport-selector';
import { NovuHttpTransport } from './transports/novu.transport';
import { EmailNotificationTransport } from './transports/email.transport';
import { RealtimeNotificationTransport } from './transports/realtime.transport';
import { ChannelNotificationTransport } from './transports/channel.transport';
import { RealtimeModule } from '../realtime/realtime.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ObservabilityModule } from '../observability/observability.module';
import { NOTIFICATION_TRANSPORT, NotificationTransport } from './outbox.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Guaranteed-delivery outbox for notifications/webhooks. Producers inject
 * OutboxService and call enqueueOnTx() inside their audited transaction; the
 * OutboxRelay (pg-boss, opt-in) ships pending messages with retries. Swap the
 * NOTIFICATION_TRANSPORT binding for a Novu/SMS transport without touching
 * producers.
 */
@Module({
  imports: [RealtimeModule, ObservabilityModule, StaffAuthModule, AuthzModule],
  controllers: [OutboxController],
  providers: [
    OutboxService,
    OutboxRelay,
    // Transport by NOTIFICATION_TRANSPORT: channels | novu (+NOVU_API_KEY) | email | realtime | log.
    {
      provide: NOTIFICATION_TRANSPORT,
      inject: [ConfigService, RealtimeGateway, PrismaService],
      useFactory: (
        config: ConfigService,
        gateway: RealtimeGateway,
        prisma: PrismaService,
      ): NotificationTransport => {
        // Выбор вынесен в чистую функцию, чтобы его можно было проверить без
        // поднятия контейнера: раньше отсутствие или опечатка в переменной
        // молча давали лог-заглушку, которая помечает сообщения `sent`.
        return selectNotificationTransport((name) => config.get<string>(name), {
          channels: () => new ChannelNotificationTransport(config, prisma),
          novu: () => new NovuHttpTransport(config),
          email: () => new EmailNotificationTransport(config),
          realtime: () => new RealtimeNotificationTransport(gateway),
          log: () => new LogNotificationTransport(),
        });
      },
    },
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
