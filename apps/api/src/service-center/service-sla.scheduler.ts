import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import type { PgBoss as PgBossClient } from 'pg-boss';
import { ServiceSlaService } from './service-sla.service';
import { AlerterService } from '../observability/alerter.service';

const QUEUE = 'service-sla-sweep';
const SCHEDULER_ID = 'service-sla-every-minute';
const ALERT_SOURCE = 'service-sla-scheduler';

@Injectable()
export class ServiceSlaScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServiceSlaScheduler.name);
  private boss?: PgBossClient;
  private queue?: Queue;
  private worker?: Worker;
  private redis?: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly sla: ServiceSlaService,
    private readonly alerter: AlerterService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('SERVICE_SLA_SWEEP_ENABLED') !== 'true') return;
    if (this.config.get<string>('JOB_BACKEND') === 'bullmq') return this.startBullMq();
    const databaseUrl = this.config.get<string>('DATABASE_URL');
    if (!databaseUrl) return;
    try {
      const { PgBoss } = await import('pg-boss');
      this.boss = new PgBoss(databaseUrl);
      this.boss.on('error', (error) => this.logger.error('pg-boss SLA error', error as Error));
      await this.boss.start();
      await this.boss.createQueue(QUEUE);
      await this.boss.work(QUEUE, async () => this.runSweep());
      await this.boss.schedule(QUEUE, '* * * * *');
    } catch (error) {
      this.boss = undefined;
      this.logger.error('Failed to start service SLA sweep', error as Error);
      this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Failed to start service SLA sweep (pg-boss)', error });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    await this.redis?.quit().catch(() => undefined);
    await this.boss?.stop().catch(() => undefined);
  }

  private async startBullMq(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    const processRole = this.config.get<string>('PROCESS_ROLE') ?? 'api';
    if (!redisUrl) {
      if (processRole === 'worker') throw new Error('REDIS_URL is required for service SLA worker');
      return;
    }
    try {
      this.redis = new Redis(redisUrl, { maxRetriesPerRequest: processRole === 'worker' ? null : 1 });
      if (processRole === 'worker') {
        this.worker = new Worker(QUEUE, async () => this.runSweep(), { connection: this.redis, concurrency: 1 });
        this.worker.on('error', (error) => this.logger.error('BullMQ SLA worker error', error));
        await this.worker.waitUntilReady();
        return;
      }
      this.queue = new Queue(QUEUE, { connection: this.redis });
      await this.queue.waitUntilReady();
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { every: 60_000 },
        { name: QUEUE, opts: { attempts: 5, backoff: { type: 'exponential', delay: 5_000 } } },
      );
    } catch (error) {
      await this.onModuleDestroy();
      this.worker = undefined;
      this.queue = undefined;
      this.redis = undefined;
      this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Failed to connect BullMQ service SLA producer', error });
      if (processRole === 'worker') throw error;
      this.logger.error('Failed to connect BullMQ service SLA producer', error as Error);
    }
  }

  private async runSweep() {
    try {
      const { escalated } = await this.sla.escalateOverdue();
      const { escalated: overdueLoaners } = await this.sla.escalateOverdueLoaners();
      if (escalated > 0) this.logger.warn(`Escalated ${escalated} overdue service case(s)`);
      if (overdueLoaners > 0) this.logger.warn(`Escalated ${overdueLoaners} overdue loaner device(s)`);
    } catch (error) {
      // Молчащий сбой = просроченные ремонты и подменные не эскалируются.
      this.logger.error('Service SLA sweep tick failed', error as Error);
      this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Service SLA sweep tick failed', error });
      throw error;
    }
  }
}
