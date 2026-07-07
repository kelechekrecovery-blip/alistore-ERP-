import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PgBoss as PgBossClient } from 'pg-boss';
import { OutboxService } from './outbox.service';

const QUEUE = 'outbox-relay';
const EVERY_MINUTE = '* * * * *';

/**
 * Durable relay for the outbox, on the SAME Postgres via pg-boss (no Redis). The
 * delivery logic lives in OutboxService (pure, unit-tested); this only owns the
 * timer. Opt-in via OUTBOX_RELAY_ENABLED, and any startup failure degrades
 * gracefully instead of taking the API down.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private boss?: PgBossClient;

  constructor(
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('OUTBOX_RELAY_ENABLED') !== 'true') {
      this.logger.log(
        'Outbox relay disabled (set OUTBOX_RELAY_ENABLED=true to enable)',
      );
      return;
    }
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      this.logger.warn('DATABASE_URL missing — outbox relay not started');
      return;
    }

    try {
      const { PgBoss } = await import('pg-boss');
      this.boss = new PgBoss(connectionString);
      this.boss.on('error', (err) =>
        this.logger.error('pg-boss error', err as Error),
      );
      await this.boss.start();
      await this.boss.createQueue(QUEUE);
      await this.boss.work(QUEUE, async () => {
        const { sent, failed } = await this.outbox.relayPending();
        if (sent > 0 || failed > 0) {
          this.logger.log(`Outbox relay: ${sent} sent, ${failed} failed`);
        }
      });
      await this.boss.schedule(QUEUE, EVERY_MINUTE);
      this.logger.log('Outbox relay scheduled (every minute via pg-boss)');
    } catch (err) {
      this.boss = undefined;
      this.logger.error('Failed to start outbox relay', err as Error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop().catch(() => undefined);
  }
}
