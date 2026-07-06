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

const MAX_DIMENSION = 1600; // downscale large uploads on the long edge
const WEBP_QUALITY = 80;

/**
 * Ingest an uploaded image: downscale to <= MAX_DIMENSION on the long edge,
 * honour EXIF orientation, and re-encode to WebP (Roadmap: «сжатие фото
 * WebP/AVIF»), then store it. Used for product photos and the Evidence Vault so
 * source images never ship far beyond their rendered size.
 */
@Injectable()
export class MediaService {
  constructor(@Inject(MEDIA_STORAGE) private readonly storage: MediaStorage) {}

  async ingestImage(input: Buffer, prefix = 'media'): Promise<IngestedImage> {
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

    const key = `${prefix}/${randomUUID()}.webp`;
    const stored = await this.storage.put(key, output.data, 'image/webp');
    return {
      key: stored.key,
      url: stored.url,
      width: output.info.width,
      height: output.info.height,
      bytes: stored.bytes,
      format: 'webp',
    };
  }
}
