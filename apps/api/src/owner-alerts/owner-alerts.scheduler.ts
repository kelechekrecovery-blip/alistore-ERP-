import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PgBoss as PgBossClient } from 'pg-boss';
import { OwnerAlertsService } from './owner-alerts.service';
import { AlerterService } from '../observability/alerter.service';

const QUEUE = 'owner-alerts';
const EVERY_FIVE_MINUTES = '*/5 * * * *';
/** Stable alert source (dedup key on the ops channel). */
const ALERT_SOURCE = 'owner-alerts-scheduler';

/**
 * Durable owner-alert sweep. Disabled unless OWNER_ALERTS_ENABLED=true so
 * CI/local boots stay side-effect free; pg-boss gives at-least-once scheduling
 * while OwnerAlertsService keeps enqueueing idempotent per ledger event.
 * Mirrors DebtsReminderScheduler (same failure-alerting contract).
 */
@Injectable()
export class OwnerAlertsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OwnerAlertsScheduler.name);
  private boss?: PgBossClient;

  constructor(
    private readonly config: ConfigService,
    private readonly alerts: OwnerAlertsService,
    private readonly alerter: AlerterService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('PROCESS_ROLE') === 'worker') return;
    if (this.config.get<string>('OWNER_ALERTS_ENABLED') !== 'true') {
      this.logger.log(
        'Owner alerts disabled (set OWNER_ALERTS_ENABLED=true to enable)',
      );
      return;
    }
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      this.logger.warn('DATABASE_URL missing - owner alerts not started');
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
        try {
          const { alerted } = await this.alerts.sweep();
          if (alerted > 0) {
            this.logger.log(`Enqueued ${alerted} owner alert(s)`);
          }
        } catch (err) {
          // Тик доносит владельцу про недостачи и опасные действия — молчащий
          // сбой прячет ровно то, что владелец должен увидеть. Алертим и
          // пробрасываем, чтобы pg-boss повторил (дедуп алертера гасит шторм).
          this.logger.error('Owner alert tick failed', err as Error);
          this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Owner alert tick failed', error: err });
          throw err;
        }
      });
      await this.boss.schedule(QUEUE, EVERY_FIVE_MINUTES);
      this.logger.log('Owner alerts scheduled (every 5 minutes via pg-boss)');
    } catch (err) {
      this.boss = undefined;
      this.logger.error('Failed to start owner alerts', err as Error);
      this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Failed to start owner alerts', error: err });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop().catch(() => undefined);
  }
}
