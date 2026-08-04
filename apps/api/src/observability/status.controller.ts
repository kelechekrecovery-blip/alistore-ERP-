import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AlerterService } from './alerter.service';
import { ErrorReporter } from './error-reporter';
import { MetricsService } from './metrics.service';

const WORKER_STALE_AFTER_SECONDS = 5 * 60;

/**
 * Minimal operations dashboard as a protected JSON endpoint (owner/admin):
 * API liveness, worker heartbeats, outbox/DLQ depth and the recent critical
 * alerts. Not a Grafana replacement — just the pre-launch gate view.
 */
@ApiTags('observability')
@Controller('observability')
export class StatusController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly alerter: AlerterService,
    private readonly reporter: ErrorReporter,
  ) {}

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Operations status: API/worker liveness, outbox/DLQ depth, recent critical alerts' })
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('observability', 'read')
  async status() {
    const [pending, failed, oldestPending, heartbeats] = await Promise.all([
      this.prisma.outboxMessage.count({ where: { status: 'pending' } }),
      this.prisma.outboxMessage.count({ where: { status: 'failed' } }),
      this.prisma.outboxMessage.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.workerHeartbeat.findMany({ orderBy: { id: 'asc' } }),
    ]);

    const now = Date.now();
    const ageSeconds = (at: Date) => Math.max(0, Math.floor((now - at.getTime()) / 1000));

    return {
      api: {
        status: 'ok',
        ...this.metrics.snapshot(),
      },
      sentry: { enabled: this.reporter.enabled },
      alerting: {
        enabled: this.alerter.enabled,
        suppressedCount: this.alerter.suppressedCount,
        recent: this.alerter.recentAlerts(20),
      },
      outbox: {
        pending,
        failed,
        oldestPendingAgeSeconds: oldestPending ? ageSeconds(oldestPending.createdAt) : null,
      },
      workers: heartbeats.map((heartbeat) => ({
        id: heartbeat.id,
        lastSeenAt: heartbeat.lastSeenAt.toISOString(),
        ageSeconds: ageSeconds(heartbeat.lastSeenAt),
        stale: ageSeconds(heartbeat.lastSeenAt) > WORKER_STALE_AFTER_SECONDS,
      })),
    };
  }
}
