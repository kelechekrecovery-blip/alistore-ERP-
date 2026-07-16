import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefundProcessor } from './refunds.processor';

@Injectable()
export class RefundRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefundRelay.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly config: ConfigService, private readonly processor: RefundProcessor) {}

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
      const processed = await this.processor.processPending();
      if (processed > 0) this.logger.log(`Processed ${processed} refund aggregate(s)`);
    } catch (error) {
      this.logger.error('Refund relay iteration failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
