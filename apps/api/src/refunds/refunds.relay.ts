import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlerterService } from '../observability/alerter.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PROVIDER_PENDING_STALE_MS } from './refunds.constants';
import { RefundProcessor } from './refunds.processor';

const HEARTBEAT_ID = 'refund-relay';

@Injectable()
export class RefundRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefundRelay.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly processor: RefundProcessor,
    private readonly alerter: AlerterService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('REFUND_RELAY_ENABLED') !== 'true') return;
    if (this.config.get<string>('PROCESS_ROLE') !== 'worker') return;
    this.timer = setInterval(() => void this.tick(), 15_000);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const swept = await this.processor.sweepStaleProviderPending(this.staleMs());
      if (swept > 0) this.logger.log(`Parked ${swept} stale provider-pending refund allocation(s)`);
      const processed = await this.processor.processPending();
      if (processed > 0) this.logger.log(`Processed ${processed} refund aggregate(s)`);
    } catch (error) {
      this.logger.error('Refund relay iteration failed', error as Error);
      this.alerter.notifyCritical({
        source: HEARTBEAT_ID,
        message: 'Refund relay iteration failed',
        error,
      });
    } finally {
      this.running = false;
      await this.heartbeat();
    }
  }

  /** Liveness signal for the status dashboard; never breaks the tick. */
  private async heartbeat() {
    try {
      await this.prisma.workerHeartbeat.upsert({
        where: { id: HEARTBEAT_ID },
        update: {},
        create: { id: HEARTBEAT_ID },
      });
    } catch (error) {
      this.logger.warn(`Heartbeat write failed: ${(error as Error).message}`);
    }
  }

  private staleMs() {
    const raw = Number(this.config.get<string>('REFUND_PROVIDER_PENDING_STALE_MS'));
    return Number.isSafeInteger(raw) && raw >= 60_000 ? raw : DEFAULT_PROVIDER_PENDING_STALE_MS;
  }
}
