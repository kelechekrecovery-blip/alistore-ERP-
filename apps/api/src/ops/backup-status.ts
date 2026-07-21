/**
 * Наблюдаемость ночного бэкапа.
 *
 * Крон `alistore-backup-prod` заливал дамп в S3 и молчал в обоих исходах: следа
 * об успехе не оставалось, а провал не доходил ни до кого — `AlerterService`
 * живёт внутри API и worker, а бэкап это отдельный процесс Render. Поэтому
 * состояние «бэкапы не делаются третью неделю» система обнаружить не могла: для
 * неё сломанный бэкап выглядел ровно как рабочий.
 *
 * Отметки ниже кладутся в `Setting` (обычный key/value, миграция не нужна) и
 * превращают это в величину, которую видно на `/health/integrations`.
 *
 * Сознательно НЕ трогаем `/health/ready`: он — гейт Render, и провал по нему
 * снимает сервис с трафика. Устаревший бэкап обязан кричать, но не имеет права
 * останавливать продажи в магазине.
 */

export const BACKUP_LAST_SUCCESS_KEY = 'ops.backup.last_success';
export const BACKUP_LAST_FAILURE_KEY = 'ops.backup.last_failure';

/**
 * 26, а не 24: крон стоит на 03:00 UTC, расписания Render дрейфуют на минуты, и
 * проверка, попавшая перед самым запуском, не должна объявлять вчерашний
 * успешный бэкап просроченным.
 */
export const DEFAULT_BACKUP_MAX_AGE_HOURS = 26;

export type BackupFreshnessStatus = 'ok' | 'stale' | 'never';

export interface BackupFreshness {
  status: BackupFreshnessStatus;
  ageHours: number | null;
  lastSuccessAt: string | null;
}

export interface BackupMarker {
  completedAt: Date;
  key: string;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Отсутствие отметки — это `never`, а не `ok`. Разница принципиальна: пустое
 * значение и есть то, как выглядит бэкап, не отработавший ни разу.
 */
export function evaluateBackupFreshness(
  lastSuccessAt: Date | null,
  now: Date = new Date(),
  maxAgeHours: number = DEFAULT_BACKUP_MAX_AGE_HOURS,
): BackupFreshness {
  if (!lastSuccessAt) return { status: 'never', ageHours: null, lastSuccessAt: null };
  const ageHours = (now.getTime() - lastSuccessAt.getTime()) / HOUR_MS;
  return {
    status: ageHours > maxAgeHours ? 'stale' : 'ok',
    ageHours: Math.round(ageHours * 100) / 100,
    lastSuccessAt: lastSuccessAt.toISOString(),
  };
}

/**
 * Битую отметку читаем как отсутствующую: проверка свежести не имеет права
 * падать из-за мусора в строке — иначе единственный сигнал о бэкапах исчезает
 * ровно тогда, когда с ними что-то не так.
 */
/** Момент последнего провала — для контекста рядом со свежестью. */
export function parseBackupFailureAt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { failedAt?: unknown };
    return typeof parsed.failedAt === 'string' ? parsed.failedAt : null;
  } catch {
    return null;
  }
}

export function parseBackupMarker(raw: string | null | undefined): BackupMarker | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { completedAt?: unknown; key?: unknown };
    if (typeof parsed.completedAt !== 'string') return null;
    const completedAt = new Date(parsed.completedAt);
    if (Number.isNaN(completedAt.getTime())) return null;
    return { completedAt, key: typeof parsed.key === 'string' ? parsed.key : '' };
  } catch {
    return null;
  }
}
