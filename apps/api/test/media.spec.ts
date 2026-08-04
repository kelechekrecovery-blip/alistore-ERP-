import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import { MediaService } from '../src/media/media.service';
import { LocalDiskStorage } from '../src/media/storage/local-disk.storage';
import { ValidationError } from '../src/common/errors';

/** sharp compression + local storage (real image buffers, temp dir). */
describe('MediaService (sharp → storage)', () => {
  let dir: string;
  let media: MediaService;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'alistore-media-'));
    const config = {
      get: (key: string) =>
        (
          { MEDIA_LOCAL_DIR: dir, MEDIA_PUBLIC_BASE: '/uploads' } as Record<
            string,
            string
          >
        )[key],
    } as unknown as ConfigService;
    media = new MediaService(new LocalDiskStorage(config));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function pngBuffer(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 10, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer();
  }

  it('compresses an image to WebP and stores a real WebP file', async () => {
    const result = await media.ingestImage(await pngBuffer(1200, 800), 'products');

    expect(result.format).toBe('webp');
    expect(result.key).toMatch(/^products\/.+\.webp$/);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    expect(result.url).toBe(`/uploads/${result.key}`);

    const stored = await readFile(join(dir, result.key));
    expect((await sharp(stored).metadata()).format).toBe('webp');
  });

  it('downscales an oversized image to the max dimension', async () => {
    const result = await media.ingestImage(await pngBuffer(4000, 2000));
    expect(result.width).toBe(1600); // long edge clamped, aspect kept
    expect(result.height).toBe(800);
  });

  it('rejects a non-image upload with a 422', async () => {
    const err = await media
      .ingestImage(Buffer.from('not an image'))
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('not_an_image');
  });

  it('rejects an empty upload', async () => {
    const err = await media.ingestImage(Buffer.alloc(0)).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('empty_upload');
  });
});
