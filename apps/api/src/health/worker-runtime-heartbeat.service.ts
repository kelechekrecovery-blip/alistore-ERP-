import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export const WORKER_RUNTIME_HEARTBEAT_ID = 'worker-runtime';
export const WORKER_RUNTIME_STALE_AFTER_MS = 90_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Durable proof that the background worker—not merely the API image—is alive
 * on a specific source revision. The public health route reveals only that
 * revision and a minimal status; all operational details stay staff-only.
 */
@Injectable()
export class WorkerRuntimeHeartbeatService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRuntimeHeartbeatService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('PROCESS_ROLE') !== 'worker') return;
    await this.beat();
    this.timer = setInterval(() => {
      void this.beat().catch((error: unknown) => {
        this.logger.error('Worker runtime heartbeat failed', error as Error);
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async beat(): Promise<void> {
    const revision = this.config.get<string>('RENDER_GIT_COMMIT')?.trim() || 'local';
    await this.prisma.workerHeartbeat.upsert({
      where: { id: WORKER_RUNTIME_HEARTBEAT_ID },
      create: { id: WORKER_RUNTIME_HEARTBEAT_ID, meta: { revision } },
      update: { meta: { revision } },
    });
  }
}
