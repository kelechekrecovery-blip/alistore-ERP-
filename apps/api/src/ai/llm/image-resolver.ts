import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { LlmImageBlock } from './llm-client';

/** A photo reference to resolve into bytes for vision analysis. */
export interface PhotoRef {
  url?: string;
  label?: string;
}

export interface ResolvedPhoto extends LlmImageBlock {
  label?: string;
}

/** Cap how many photos and bytes we send — controls token cost and request size. */
const MAX_PHOTOS = 6;
const MAX_EDGE_PX = 1568; // Claude downsamples above ~1568px anyway; do it locally to save tokens.
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Resolve photo references (HTTP(S) URLs or local `/uploads/...` paths) into base64
 * JPEG image blocks for vision-capable providers. Each image is downscaled/re-encoded via
 * sharp to bound size. References that don't resolve are skipped (never faked) so the
 * grader can lower confidence or fall back to rules. Best-effort: a single bad URL never
 * throws the whole batch.
 */
export async function resolvePhotoImages(
  photos: PhotoRef[],
  opts: { localDir?: string; publicBase?: string } = {},
): Promise<ResolvedPhoto[]> {
  const localDir = opts.localDir ?? process.env.MEDIA_LOCAL_DIR ?? './uploads';
  const publicBase = opts.publicBase ?? process.env.MEDIA_PUBLIC_BASE ?? '/uploads';

  const withUrl = photos.filter((p) => typeof p.url === 'string' && p.url.trim().length > 0).slice(0, MAX_PHOTOS);
  const settled = await Promise.all(
    withUrl.map(async (p): Promise<ResolvedPhoto | null> => {
      try {
        const bytes = await loadBytes(p.url as string, localDir, publicBase);
        if (!bytes) return null;
        const jpeg = await sharp(bytes)
          .rotate()
          .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        return { type: 'image', mediaType: 'image/jpeg', dataBase64: jpeg.toString('base64'), label: p.label };
      } catch {
        return null;
      }
    }),
  );
  return settled.filter((x): x is ResolvedPhoto => x !== null);
}

async function loadBytes(url: string, localDir: string, publicBase: string): Promise<Buffer | null> {
  if (/^https?:\/\//i.test(url)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }
  // Local media path served under publicBase (e.g. "/uploads/x.webp") → read from disk.
  const rel = url.startsWith(publicBase) ? url.slice(publicBase.length) : url;
  const safeRel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const abs = path.resolve(localDir, safeRel);
  if (!abs.startsWith(path.resolve(localDir))) return null; // guard traversal
  return readFile(abs);
}
