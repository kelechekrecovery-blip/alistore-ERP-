import { Controller, Get, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
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
import {
  WORKER_RUNTIME_HEARTBEAT_ID,
  WORKER_RUNTIME_STALE_AFTER_MS,
} from './worker-runtime-heartbeat.service';

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
  check(@Res({ passthrough: true }) response: Response) {
    return this.ready(response);
  }

  /** Explicit readiness alias for managed-cloud probes. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    try {
      await this.probe();
    } catch {
      throw new ServiceUnavailableException();
    }
    return this.publicStatus(response);
  }

  /** Liveness — the process is up (no dependencies checked). */
  @Get('live')
  live(@Res({ passthrough: true }) response: Response) {
    return this.publicStatus(response);
  }

  /** Minimal, revision-bound liveness proof for the separate worker service. */
  @Get('worker')
  async worker(@Res({ passthrough: true }) response: Response) {
    const heartbeat = await this.prisma.workerHeartbeat.findUnique({
      where: { id: WORKER_RUNTIME_HEARTBEAT_ID },
    });
    const revision = this.workerRevision(heartbeat?.meta);
    const fresh = heartbeat
      && Date.now() - heartbeat.lastSeenAt.getTime() <= WORKER_RUNTIME_STALE_AFTER_MS;
    if (!fresh || !revision) throw new ServiceUnavailableException();
    response.setHeader('X-AliStore-Revision', revision);
    return { status: 'ok' as const };
  }

  private publicStatus(response: Response) {
    const revision = this.config.get<string>('RENDER_GIT_COMMIT')?.trim();
    if (revision) response.setHeader('X-AliStore-Revision', revision);
    return { status: 'ok' as const };
  }

  private workerRevision(meta: unknown): string | null {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
    const revision = (meta as Record<string, unknown>).revision;
    return typeof revision === 'string' && revision.trim() ? revision.trim() : null;
  }

  /**
   * Полная диагностика — та же проверка, что и `/health/ready`, но с составом.
   *
   * Публичные пробы намеренно отвечают одним `{status:"ok"}`: балансировщику
   * достаточно кода ответа, а перечень компонентов и порог кучи — это карта
   * внутренностей, которую анониму знать незачем. Диагностика не потеряна,
   * она просто требует staff-токена.
   */
  @Get('details')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('reports', 'read')
  @HealthCheck()
  details() {
    return this.probe();
  }

  /**
   * Собственно проверка. Публичные обёртки гасят её отчёт до кода ответа,
   * staff-эндпойнт отдаёт как есть.
   *
   * Terminus кладёт в тело 503 полный отчёт — с именем упавшего индикатора и
   * его сообщением. Для публичной пробы это означало бы, что деградация БД
   * становится публичным событием, а состав сервиса — читаемым без всякой
   * авторизации.
   */
  private probe() {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma),
      () => this.memory.checkHeap('memory_heap', READINESS_HEAP_LIMIT_BYTES),
    ]);
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
