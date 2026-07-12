import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

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
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: gzipSync(dump),
    ContentType: 'application/gzip',
    ServerSideEncryption: 'AES256',
  }));
  console.log(`Encrypted database backup uploaded: ${key}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

void main();
