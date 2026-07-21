import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { AlerterService } from '../observability/alerter.service';
import { BACKUP_LAST_FAILURE_KEY, BACKUP_LAST_SUCCESS_KEY } from './backup-status';

/**
 * Ночной дамп в S3.
 *
 * Раньше скрипт молчал в обоих исходах: успех не оставлял следа, а провал не
 * доходил ни до кого — `AlerterService` живёт в API и worker, а это отдельный
 * процесс Render. «Бэкапы сломаны третью неделю» было состоянием, которое
 * система не могла обнаружить: сломанный бэкап выглядел ровно как рабочий.
 *
 * Теперь исход записывается в `Setting` (его читает `/health/integrations`), а
 * провал вдобавок уходит в Telegram — с ожиданием доставки, иначе процесс
 * завершится раньше отправки.
 */
async function main(): Promise<void> {
  const databaseUrl = required('DATABASE_URL');
  const endpoint = required('S3_ENDPOINT');
  const bucket = required('S3_BACKUP_BUCKET');
  const accessKeyId = required('MINIO_ROOT_USER');
  const secretAccessKey = required('MINIO_ROOT_PASSWORD');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `postgres/alistore-${timestamp}.dump.gz`;
  const dump = execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-acl', databaseUrl], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  const body = gzipSync(dump);
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/gzip',
    ServerSideEncryption: 'AES256',
  }));
  await recordOutcome(BACKUP_LAST_SUCCESS_KEY, {
    completedAt: new Date().toISOString(),
    key,
    bytes: body.byteLength,
  });
  console.log(`Encrypted database backup uploaded: ${key} (${body.byteLength} bytes)`);
}

/**
 * Отметка живёт в `Setting` — обычный key/value, поэтому миграция не нужна.
 * Своё подключение и своё закрытие: скрипт не поднимает Nest.
 */
async function recordOutcome(key: string, payload: Record<string, unknown>): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(payload), updatedBy: 'backup-cron' },
      update: { value: JSON.stringify(payload), updatedBy: 'backup-cron' },
    });
  } finally {
    await prisma.$disconnect();
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

void main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database backup failed: ${message}`);

  // Записать провал и позвать людей — обе операции best-effort: если упал сам
  // бэкап, то БД или сеть уже могут быть недоступны, и падение уведомления не
  // должно подменить собой исходную причину в логе.
  await recordOutcome(BACKUP_LAST_FAILURE_KEY, {
    failedAt: new Date().toISOString(),
    message: message.slice(0, 500),
  }).catch(() => undefined);
  await new AlerterService(new ConfigService()).notifyCriticalAndWait({
    source: 'backup-cron',
    message: 'Ночной бэкап базы не выполнен',
    error,
  }).catch(() => undefined);

  process.exitCode = 1;
});
