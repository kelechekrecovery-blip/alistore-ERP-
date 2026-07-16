import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ValidationError } from '../common/errors';
import { MEDIA_STORAGE, MediaStorage } from './media-storage';

export interface IngestedImage {
  key: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  format: 'webp';
}

export interface PreparedImage {
  data: Buffer;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1600; // downscale large uploads on the long edge
const WEBP_QUALITY = 80;
export const MEDIA_UPLOAD_TIMEOUT_MS = 2 * 60_000;

/**
 * Ingest an uploaded image: downscale to <= MAX_DIMENSION on the long edge,
 * honour EXIF orientation, and re-encode to WebP (Roadmap: «сжатие фото
 * WebP/AVIF»), then store it. Used for product photos and the Evidence Vault so
 * source images never ship far beyond their rendered size.
 */
@Injectable()
export class MediaService {
  constructor(@Inject(MEDIA_STORAGE) private readonly storage: MediaStorage) {}

  createImageKey(prefix = 'media'): string {
    return `${prefix}/${randomUUID()}.webp`;
  }

  async ingestImage(input: Buffer, prefix = 'media', objectKey?: string): Promise<IngestedImage> {
    const prepared = await this.prepareImage(input);
    return this.storePreparedImage(prepared, prefix, objectKey);
  }

  async prepareImage(input: Buffer): Promise<PreparedImage> {
    if (!input || input.byteLength === 0) {
      throw new ValidationError('empty_upload', 'Пустой файл');
    }

    let output;
    try {
      output = await sharp(input)
        .rotate() // honour EXIF orientation before resizing
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ValidationError('not_an_image', 'Файл не является изображением');
    }

    return {
      data: output.data,
      width: output.info.width,
      height: output.info.height,
    };
  }

  async storePreparedImage(
    prepared: PreparedImage,
    prefix = 'media',
    objectKey?: string,
  ): Promise<IngestedImage> {
    const key = objectKey ?? this.createImageKey(prefix);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MEDIA_UPLOAD_TIMEOUT_MS);
    timeout.unref();
    let stored;
    try {
      stored = await this.storage.put(key, prepared.data, 'image/webp', controller.signal);
    } finally {
      clearTimeout(timeout);
    }
    return {
      key: stored.key,
      url: stored.url,
      width: prepared.width,
      height: prepared.height,
      bytes: stored.bytes,
      format: 'webp',
    };
  }

  async deleteImage(key: string): Promise<void> {
    await this.storage.delete(key);
  }
}
