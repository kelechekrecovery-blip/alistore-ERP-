import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

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
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }

  /** Liveness — the process is up (no dependencies checked). */
  @Get('live')
  live() {
    return { status: 'ok' };
  }
}
