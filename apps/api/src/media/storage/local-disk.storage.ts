import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MediaStorage, StoredObject } from '../media-storage';

/**
 * Stores media on local disk under MEDIA_LOCAL_DIR (default ./uploads) and returns
 * a URL under MEDIA_PUBLIC_BASE (serve that dir statically to expose it). The
 * single-node default; swap for S3Storage (MinIO) in production.
 */
@Injectable()
export class LocalDiskStorage implements MediaStorage {
  private readonly dir: string;
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('MEDIA_LOCAL_DIR') ?? './uploads';
    this.publicBase = config.get<string>('MEDIA_PUBLIC_BASE') ?? '/uploads';
  }

  async put(
    key: string,
    body: Buffer,
    _contentType: string,
    signal?: AbortSignal,
  ): Promise<StoredObject> {
    const path = join(this.dir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { signal });
    return { key, url: `${this.publicBase}/${key}`, bytes: body.byteLength };
  }

  async delete(key: string): Promise<void> {
    await unlink(join(this.dir, key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  async getReadUrl(key: string): Promise<string> {
    return `${this.publicBase}/${key}`;
  }
}
