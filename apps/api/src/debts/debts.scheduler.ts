import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PgBoss as PgBossClient } from 'pg-boss';
import { DebtsService } from './debts.service';

const QUEUE = 'debt-reminders';
const EVERY_MORNING = '0 8 * * *';

/**
 * Durable debt reminder sweep. Disabled unless DEBT_REMINDERS_ENABLED=true so
 * CI/local boots stay side-effect free; pg-boss gives at-least-once scheduling
 * while DebtsService keeps reminder enqueueing idempotent.
 */
@Injectable()
export class DebtsReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DebtsReminderScheduler.name);
  private boss?: PgBossClient;

  constructor(
    private readonly config: ConfigService,
    private readonly debts: DebtsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('PROCESS_ROLE') === 'worker') return;
    if (this.config.get<string>('DEBT_REMINDERS_ENABLED') !== 'true') {
      this.logger.log(
        'Debt reminders disabled (set DEBT_REMINDERS_ENABLED=true to enable)',
      );
      return;
    }
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      this.logger.warn('DATABASE_URL missing - debt reminders not started');
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
        const { queued } = await this.debts.enqueueReminders();
        if (queued > 0) {
          this.logger.log(`Queued ${queued} debt reminder(s)`);
        }
      });
      await this.boss.schedule(QUEUE, EVERY_MORNING);
      this.logger.log('Debt reminders scheduled (08:00 daily via pg-boss)');
    } catch (err) {
      this.boss = undefined;
      this.logger.error('Failed to start debt reminders', err as Error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop().catch(() => undefined);
  }
}
