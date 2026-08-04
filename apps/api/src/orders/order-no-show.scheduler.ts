import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PgBoss as PgBossClient } from 'pg-boss';
import { AlerterService } from '../observability/alerter.service';
import { OrdersService } from './orders.service';

const QUEUE = 'order-no-show-reminders';
const EVERY_MORNING = '15 9 * * *';
const ALERT_SOURCE = 'order-no-show-scheduler';

@Injectable()
export class OrderNoShowScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderNoShowScheduler.name);
  private boss?: PgBossClient;

  constructor(
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
    private readonly alerter: AlerterService,
  ) {}

  async onModuleInit() {
    if (this.config.get<string>('PROCESS_ROLE') === 'worker') return;
    if (this.config.get<string>('ORDER_NO_SHOW_REMINDERS_ENABLED') !== 'true') return;
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      this.logger.warn('DATABASE_URL missing — no-show reminders not started');
      return;
    }
    try {
      const { PgBoss } = await import('pg-boss');
      this.boss = new PgBoss(connectionString);
      this.boss.on('error', (error) => this.logger.error('pg-boss error', error as Error));
      await this.boss.start();
      await this.boss.createQueue(QUEUE);
      await this.boss.work(QUEUE, async () => {
        try {
          const result = await this.orders.sweepNoShow();
          if (result.reminders || result.ownerTasks) {
            this.logger.log(`No-show sweep: ${result.reminders} reminder(s), ${result.ownerTasks} task(s)`);
          }
        } catch (error) {
          this.alerter.notifyCritical({
            source: ALERT_SOURCE,
            message: 'Order no-show sweep failed',
            error,
          });
          throw error;
        }
      });
      await this.boss.schedule(QUEUE, EVERY_MORNING);
    } catch (error) {
      this.boss = undefined;
      this.alerter.notifyCritical({
        source: ALERT_SOURCE,
        message: 'Failed to start order no-show scheduler',
        error,
      });
    }
  }

  async onModuleDestroy() {
    await this.boss?.stop().catch(() => undefined);
  }
}
