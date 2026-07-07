import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

const READINESS_HEAP_LIMIT_BYTES = 1536 * 1024 * 1024;

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
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
}
