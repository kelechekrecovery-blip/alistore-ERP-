import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { buildExternalReadinessReport } from './external-readiness';

const READINESS_HEAP_LIMIT_BYTES = 1536 * 1024 * 1024;

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Readiness — DB reachable + heap sane. For orchestrators / load balancers. */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma),
      () => this.memory.checkHeap('memory_heap', READINESS_HEAP_LIMIT_BYTES),
    ]);
  }

  /** Liveness — the process is up (no dependencies checked). */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** External integrations readiness — no secret values, only configured/missing status. */
  @Get('integrations')
  integrations() {
    return buildExternalReadinessReport((name) => this.config.get<string>(name));
  }
}
