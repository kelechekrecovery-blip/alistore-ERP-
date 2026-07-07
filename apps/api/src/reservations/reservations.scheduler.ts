import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PgBoss as PgBossClient } from 'pg-boss';
import { ReservationsService } from './reservations.service';

const QUEUE = 'reservation-expiry';
const EVERY_MINUTE = '* * * * *';

/**
 * Durable scheduler for the reservation-expiry sweep, backed by pg-boss on the
 * SAME Postgres the app already uses — no Redis, no extra service to run in each
 * store (fits the offline-first, graceful-degradation constraints).
 *
 * pg-boss owns the timer and at-least-once delivery; the actual release logic
 * lives in ReservationsService (pure and unit-tested). The sweep is opt-in via
 * RESERVATION_SWEEP_ENABLED so tests/CI and one-off boots never spin up a queue,
 * and any failure to start degrades gracefully instead of crashing the API.
 */
@Injectable()
export class ReservationsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationsScheduler.name);
  private boss?: PgBossClient;

  constructor(
    private readonly config: ConfigService,
    private readonly reservations: ReservationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('RESERVATION_SWEEP_ENABLED') !== 'true') {
      this.logger.log(
        'Reservation sweep disabled (set RESERVATION_SWEEP_ENABLED=true to enable)',
      );
      return;
    }
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      this.logger.warn('DATABASE_URL missing — reservation sweep not started');
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
        const { released } = await this.reservations.releaseExpired();
        if (released > 0) {
          this.logger.log(`Released ${released} expired reservation(s)`);
        }
      });
      await this.boss.schedule(QUEUE, EVERY_MINUTE);
      this.logger.log('Reservation sweep scheduled (every minute via pg-boss)');
    } catch (err) {
      // Graceful degradation: queue infra being down must not take the API down.
      this.boss = undefined;
      this.logger.error('Failed to start reservation sweep', err as Error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop().catch(() => undefined);
  }
}
