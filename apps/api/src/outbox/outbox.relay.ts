import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import type { PgBoss as PgBossClient } from 'pg-boss';
import { OutboxService } from './outbox.service';

const QUEUE = 'outbox-relay';
const EVERY_MINUTE = '* * * * *';
const SCHEDULER_ID = 'outbox-relay-every-minute';

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
  private queue?: Queue;
  private worker?: Worker;
  private redis?: Redis;

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
    if (this.config.get<string>('JOB_BACKEND') === 'bullmq') {
      await this.startBullMq();
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
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    await this.redis?.quit().catch(() => undefined);
    await this.boss?.stop().catch(() => undefined);
  }

  private async startBullMq(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    const processRole = this.config.get<string>('PROCESS_ROLE') ?? 'api';
    if (!redisUrl) {
      const error = new Error('REDIS_URL is required for JOB_BACKEND=bullmq');
      if (processRole === 'worker') throw error;
      this.logger.error(error.message);
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: processRole === 'worker' ? null : 1,
      });
      if (processRole === 'worker') {
        this.worker = new Worker(
          QUEUE,
          async () => {
            const { sent, failed } = await this.outbox.relayPending();
            if (sent > 0 || failed > 0) {
              this.logger.log(`Outbox relay: ${sent} sent, ${failed} failed`);
            }
          },
          { connection: this.redis, concurrency: 1 },
        );
        this.worker.on('error', (error) =>
          this.logger.error('BullMQ outbox worker error', error),
        );
        await this.worker.waitUntilReady();
        this.logger.log('BullMQ outbox worker ready');
        return;
      }

      this.queue = new Queue(QUEUE, { connection: this.redis });
      await this.queue.waitUntilReady();
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { every: 60_000 },
        { name: QUEUE, opts: { attempts: 5, backoff: { type: 'exponential', delay: 5_000 } } },
      );
      this.logger.log('BullMQ outbox schedule registered (every minute)');
    } catch (error) {
      await this.onModuleDestroy();
      this.worker = undefined;
      this.queue = undefined;
      this.redis = undefined;
      if (processRole === 'worker') throw error;
      this.logger.error('Failed to connect BullMQ outbox producer', error as Error);
    }
  }
}
