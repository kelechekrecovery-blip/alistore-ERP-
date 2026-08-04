import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
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
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? '14');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `postgres/alistore-${timestamp}.dump.gz`;
  const workDir = mkdtempSync(join(tmpdir(), 'alistore-backup-'));
  const dumpPath = join(workDir, 'dump');
  const gzipPath = `${dumpPath}.gz`;

  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    // `--file` вместо stdout: раньше дамп целиком лежал в буфере процесса, а
    // потом второй копией — в gzip-буфере, с потолком 1 ГиБ. На выросшей базе
    // джоба умирала бы молча, ровно в ту ночь, когда бэкап впервые нужен.
    execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dumpPath, libpqUrl(databaseUrl)]);

    // Целостность. Оборванный дамп записывался и помечался успехом наравне с
    // целым — то самое «сломанный бэкап выглядит как рабочий», против которого
    // писан этот файл. `pg_restore --list` читает оглавление и падает на
    // усечённом архиве, то есть проверяет ровно тот путь, которым дамп будут
    // восстанавливать.
    const toc = execFileSync('pg_restore', ['--list', dumpPath], { encoding: 'utf8' });
    const entries = toc.split('\n').filter((line) => line.trim() && !line.startsWith(';')).length;
    if (entries === 0) throw new Error('дамп прочитан, но пуст: в оглавлении нет ни одного объекта');

    await pipeline(createReadStream(dumpPath), createGzip(), createWriteStream(gzipPath));
    const bytes = statSync(gzipPath).size;

    // Шифрование на стороне провайдера запрашиваем только если попросили явно.
    // Раньше здесь безусловно уходило `ServerSideEncryption: 'AES256'` (SSE-S3),
    // а прод пишет в Cloudflare R2, который SSE-S3 не документирует: заголовок
    // там в лучшем случае игнорируется. Локальный MinIO его прямо отвергает
    // («KMS not configured») — на этом первый прогон drill и остановился. Данные
    // при этом не остаются голыми: R2 шифрует всё на диске сам (AES-256-GCM), а
    // S3 применяет SSE-S3 по умолчанию. `S3_SSE=AES256` возвращает прежнее
    // поведение там, где хранилище этого требует.
    const sse = process.env.S3_SSE?.trim();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(gzipPath),
      ContentLength: bytes,
      ContentType: 'application/gzip',
      ...(sse ? { ServerSideEncryption: sse as 'AES256' } : {}),
    }));
    await recordOutcome(BACKUP_LAST_SUCCESS_KEY, {
      completedAt: new Date().toISOString(),
      key,
      bytes,
      tocEntries: entries,
    });
    console.log(`Database backup uploaded: ${key} (${bytes} bytes, ${entries} objects)`);

    const removed = await pruneOlderThan(client, bucket, keepDays, key);
    if (removed.length) console.log(`Rotated ${removed.length} backup(s) older than ${keepDays} days`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * `pg_dump` работает с libpq-строкой и падает на параметрах Prisma: «неверный
 * параметр в URI: schema». Прод получает URL от Render без них и потому цел, но
 * любая локальная или staging-строка (`?schema=public`, `connection_limit`,
 * `pgbouncer`) роняла бы бэкап — что и вскрылось на первом же прогоне drill.
 * Оставляем только то, что понимает libpq.
 */
export function libpqUrl(value: string): string {
  const allowed = new Set(['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'connect_timeout', 'application_name', 'options']);
  const url = new URL(value);
  for (const name of [...url.searchParams.keys()]) {
    if (!allowed.has(name)) url.searchParams.delete(name);
  }
  return url.toString();
}

/**
 * Ротации не было вовсе: объекты копились вечно, и счёт за хранение рос ровно до
 * того момента, когда кто-нибудь заметит. Имя переменной то же, что у
 * `infra/backup.sh`, чтобы два пути бэкапа не разъезжались в поведении.
 */
async function pruneOlderThan(
  client: S3Client,
  bucket: string,
  keepDays: number,
  justUploaded: string,
): Promise<string[]> {
  if (!Number.isFinite(keepDays) || keepDays <= 0) return [];
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const stale: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'postgres/',
      ContinuationToken: token,
    }));
    for (const object of page.Contents ?? []) {
      // Свежезалитый объект не трогаем никогда, даже если часы съехали: бэкап,
      // удаливший сам себя, хуже отсутствия ротации.
      if (!object.Key || object.Key === justUploaded) continue;
      if ((object.LastModified?.getTime() ?? Date.now()) < cutoff) stale.push(object.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  for (const key of stale) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
  return stale;
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

// Запускаем только когда файл исполняется напрямую (крон Render:
// `node apps/api/dist/ops/backup-to-s3.js`). При импорте из теста — например,
// чтобы проверить `libpqUrl` — `main()` не должен стартовать и лезть в БД/S3.
if (require.main === module) {
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
}
