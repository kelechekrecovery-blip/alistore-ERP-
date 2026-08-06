"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.libpqUrl = libpqUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const promises_1 = require("node:stream/promises");
const node_zlib_1 = require("node:zlib");
const alerter_service_1 = require("../observability/alerter.service");
const backup_status_1 = require("./backup-status");
async function main() {
    const databaseUrl = required('DATABASE_URL');
    const endpoint = required('S3_ENDPOINT');
    const bucket = required('S3_BACKUP_BUCKET');
    const accessKeyId = required('MINIO_ROOT_USER');
    const secretAccessKey = required('MINIO_ROOT_PASSWORD');
    const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? '14');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `postgres/alistore-${timestamp}.dump.gz`;
    const workDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'alistore-backup-'));
    const dumpPath = (0, node_path_1.join)(workDir, 'dump');
    const gzipPath = `${dumpPath}.gz`;
    const client = new client_s3_1.S3Client({
        endpoint,
        region: process.env.S3_REGION ?? 'auto',
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
    });
    try {
        (0, node_child_process_1.execFileSync)('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dumpPath, libpqUrl(databaseUrl)]);
        const toc = (0, node_child_process_1.execFileSync)('pg_restore', ['--list', dumpPath], { encoding: 'utf8' });
        const entries = toc.split('\n').filter((line) => line.trim() && !line.startsWith(';')).length;
        if (entries === 0)
            throw new Error('дамп прочитан, но пуст: в оглавлении нет ни одного объекта');
        await (0, promises_1.pipeline)((0, node_fs_1.createReadStream)(dumpPath), (0, node_zlib_1.createGzip)(), (0, node_fs_1.createWriteStream)(gzipPath));
        const bytes = (0, node_fs_1.statSync)(gzipPath).size;
        const sse = process.env.S3_SSE?.trim();
        await client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: (0, node_fs_1.createReadStream)(gzipPath),
            ContentLength: bytes,
            ContentType: 'application/gzip',
            ...(sse ? { ServerSideEncryption: sse } : {}),
        }));
        await recordOutcome(backup_status_1.BACKUP_LAST_SUCCESS_KEY, {
            completedAt: new Date().toISOString(),
            key,
            bytes,
            tocEntries: entries,
        });
        console.log(`Database backup uploaded: ${key} (${bytes} bytes, ${entries} objects)`);
        const removed = await pruneOlderThan(client, bucket, keepDays, key);
        if (removed.length)
            console.log(`Rotated ${removed.length} backup(s) older than ${keepDays} days`);
    }
    finally {
        (0, node_fs_1.rmSync)(workDir, { recursive: true, force: true });
    }
}
function libpqUrl(value) {
    const allowed = new Set(['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'connect_timeout', 'application_name', 'options']);
    const url = new URL(value);
    for (const name of [...url.searchParams.keys()]) {
        if (!allowed.has(name))
            url.searchParams.delete(name);
    }
    return url.toString();
}
async function pruneOlderThan(client, bucket, keepDays, justUploaded) {
    if (!Number.isFinite(keepDays) || keepDays <= 0)
        return [];
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    const stale = [];
    let token;
    do {
        const page = await client.send(new client_s3_1.ListObjectsV2Command({
            Bucket: bucket,
            Prefix: 'postgres/',
            ContinuationToken: token,
        }));
        for (const object of page.Contents ?? []) {
            if (!object.Key || object.Key === justUploaded)
                continue;
            if ((object.LastModified?.getTime() ?? Date.now()) < cutoff)
                stale.push(object.Key);
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    for (const key of stale) {
        await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
    return stale;
}
async function recordOutcome(key, payload) {
    const prisma = new client_1.PrismaClient();
    try {
        await prisma.setting.upsert({
            where: { key },
            create: { key, value: JSON.stringify(payload), updatedBy: 'backup-cron' },
            update: { value: JSON.stringify(payload), updatedBy: 'backup-cron' },
        });
    }
    finally {
        await prisma.$disconnect();
    }
}
function required(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`${name} is required`);
    return value;
}
if (require.main === module) {
    void main().catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Database backup failed: ${message}`);
        await recordOutcome(backup_status_1.BACKUP_LAST_FAILURE_KEY, {
            failedAt: new Date().toISOString(),
            message: message.slice(0, 500),
        }).catch(() => undefined);
        await new alerter_service_1.AlerterService(new config_1.ConfigService()).notifyCriticalAndWait({
            source: 'backup-cron',
            message: 'Ночной бэкап базы не выполнен',
            error,
        }).catch(() => undefined);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=backup-to-s3.js.map