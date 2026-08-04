import {
  BACKUP_LAST_FAILURE_KEY,
  BACKUP_LAST_SUCCESS_KEY,
  DEFAULT_BACKUP_MAX_AGE_HOURS,
  evaluateBackupFreshness,
  parseBackupMarker,
} from '../src/ops/backup-status';

/**
 * Сломанный бэкап был неотличим от рабочего.
 *
 * Крон загружал дамп в S3 и молчал в обоих исходах: об успехе не оставалось
 * следа, а провал не доходил ни до кого — `AlerterService` живёт внутри API и
 * worker, а бэкап это отдельный процесс. Единственный за всё время restore-drill
 * проводился вручную и на локальной машине. То есть «бэкапы не делаются уже
 * третью неделю» — состояние, которое система не могла обнаружить в принципе.
 *
 * Отметка последнего успеха превращает это в наблюдаемую величину: возраст
 * можно сравнить с суточным расписанием и закричать, когда он вырос.
 */
describe('Бэкап · свежесть наблюдаема', () => {
  const now = new Date('2026-07-21T12:00:00.000Z');

  it('успех прошлой ночи — норма', () => {
    const result = evaluateBackupFreshness(new Date('2026-07-21T03:00:00.000Z'), now);

    expect(result.status).toBe('ok');
    expect(result.ageHours).toBe(9);
  });

  /**
   * Порог 26 часов, а не 24: крон стоит на 03:00, и проверка в 02:59 не должна
   * считать вчерашний бэкап просроченным из-за дрейфа расписания на минуты.
   */
  it('суточное расписание с запасом: 25 часов ещё норма, 27 — уже нет', () => {
    const justInside = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const justOutside = new Date(now.getTime() - 27 * 60 * 60 * 1000);

    expect(evaluateBackupFreshness(justInside, now).status).toBe('ok');
    expect(evaluateBackupFreshness(justOutside, now).status).toBe('stale');
    expect(DEFAULT_BACKUP_MAX_AGE_HOURS).toBe(26);
  });

  /**
   * Главный случай. Отсутствие отметки — это не «всё хорошо, просто пусто»:
   * ровно так выглядит бэкап, который не отработал ни разу.
   */
  it('отсутствие отметки — это тревога, а не пустота', () => {
    const result = evaluateBackupFreshness(null, now);

    expect(result.status).toBe('never');
    expect(result.ageHours).toBeNull();
  });

  it('битую отметку читаем как отсутствие, а не роняем проверку', () => {
    expect(parseBackupMarker(null)).toBeNull();
    expect(parseBackupMarker('не json')).toBeNull();
    expect(parseBackupMarker('{"completedAt":"вчера"}')).toBeNull();
    expect(parseBackupMarker('{"completedAt":"2026-07-21T03:00:00.000Z","key":"postgres/x.gz"}'))
      .toEqual({ completedAt: new Date('2026-07-21T03:00:00.000Z'), key: 'postgres/x.gz' });
  });

  it('ключи отметок стабильны — по ним читает health и пишет крон', () => {
    expect(BACKUP_LAST_SUCCESS_KEY).toBe('ops.backup.last_success');
    expect(BACKUP_LAST_FAILURE_KEY).toBe('ops.backup.last_failure');
  });
});
