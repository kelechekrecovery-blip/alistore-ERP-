import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MediaStorage, StoredObject } from '../media-storage';

/**
 * Stores media in an S3-compatible bucket — MinIO in the v1 infra, or AWS S3.
 * Path-style addressing for MinIO. Not exercised by the tests here (no live MinIO
 * on the dev machine) — a thin adapter over the standard S3 PutObject API.
 */
@Injectable()
export class S3Storage implements MediaStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;
  private readonly evidenceUrlTtl: number;

  constructor(config: ConfigService) {
    const endpoint =
      config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000';
    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'alistore';
    this.publicBase =
      config.get<string>('S3_PUBLIC_BASE') ?? `${endpoint}/${this.bucket}`;
    this.evidenceUrlTtl = Math.min(900, Math.max(60, Number(config.get<string>('EVIDENCE_SIGNED_URL_TTL_SECONDS') ?? 300)));
    this.client = new S3Client({
      endpoint,
      region: config.get<string>('S3_REGION') ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>('MINIO_ROOT_USER') ?? 'alistore',
        secretAccessKey: config.get<string>('MINIO_ROOT_PASSWORD') ?? '',
      },
    });
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
      { abortSignal: signal },
    );
    const url = key.startsWith('evidence/')
      ? await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: this.evidenceUrlTtl })
      : `${this.publicBase}/${key}`;
    return { key, url, bytes: body.byteLength };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
