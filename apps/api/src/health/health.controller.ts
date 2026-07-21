import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import {
  BACKUP_LAST_FAILURE_KEY,
  BACKUP_LAST_SUCCESS_KEY,
  evaluateBackupFreshness,
  parseBackupFailureAt,
  parseBackupMarker,
} from '../ops/backup-status';
import { PrismaService } from '../prisma/prisma.service';
import { buildExternalReadinessReport } from './external-readiness';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';

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
    return this.ready();
  }

  /** Explicit readiness alias for managed-cloud probes. */
  @Get('ready')
  @HealthCheck()
  ready() {
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

  /**
   * External integrations readiness — no secret values, only configured/missing
   * status. Still owner-facing intelligence: it enumerates every required env
   * name and exactly which ones are unset, i.e. a checklist of what is not yet
   * hardened. Kept behind staff auth; `/health`, `/health/ready` and
   * `/health/live` stay public for load balancers.
   */
  @Get('integrations')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('reports', 'read')
  async integrations() {
    return {
      ...buildExternalReadinessReport((name) => this.config.get<string>(name)),
      backup: await this.backupFreshness(),
    };
  }

  /**
   * Возраст последнего успешного бэкапа.
   *
   * Отметку пишет крон `backup-to-s3`; до неё сломанный бэкап был неотличим от
   * рабочего, и «дампов нет третью неделю» никак не проявлялось. Сознательно
   * НЕ участвует в `/health/ready`: тот гейт снимает сервис с трафика, а
   * устаревший бэкап обязан кричать, но не имеет права останавливать продажи.
   */
  private async backupFreshness() {
    const [success, failure] = await Promise.all([
      this.prisma.setting.findUnique({ where: { key: BACKUP_LAST_SUCCESS_KEY } }),
      this.prisma.setting.findUnique({ where: { key: BACKUP_LAST_FAILURE_KEY } }),
    ]);
    const marker = parseBackupMarker(success?.value);
    return {
      ...evaluateBackupFreshness(marker?.completedAt ?? null),
      lastFailureAt: parseBackupFailureAt(failure?.value),
    };
  }
}
