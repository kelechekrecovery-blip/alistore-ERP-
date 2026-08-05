import * as dns from 'node:dns/promises';
import * as https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
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

export class ImagePolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ImagePolicyError';
  }
}

export interface ResolvePhotoOptions {
  localDir?: string;
  publicBase?: string;
  /** Exact HTTPS origins. Empty means remote images are denied. */
  allowedRemoteOrigins?: string[];
  network?: ImageResolverNetwork;
}

export interface ImageResolverNetwork {
  lookup(hostname: string): Promise<ResolvedAddress[]>;
  request(
    url: URL,
    options: https.RequestOptions,
    callback: (response: IncomingMessage) => void,
  ): ClientRequest;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

const MAX_PHOTOS = 6;
const MAX_EDGE_PX = 1568;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 16_000_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/avif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const DEFAULT_NETWORK: ImageResolverNetwork = {
  lookup: (hostname) => dns.lookup(hostname, { all: true, verbatim: true }) as Promise<ResolvedAddress[]>,
  request: (url, options, callback) => https.request(url, options, callback),
};

/**
 * Resolve allowlisted remote images or local Evidence paths into bounded JPEGs.
 * Invalid references are skipped so grading can safely fall back to labels.
 */
export async function resolvePhotoImages(
  photos: PhotoRef[],
  opts: ResolvePhotoOptions = {},
): Promise<ResolvedPhoto[]> {
  const localDir = opts.localDir ?? process.env.MEDIA_LOCAL_DIR ?? './uploads';
  const publicBase = opts.publicBase ?? process.env.MEDIA_PUBLIC_BASE ?? '/uploads';
  const allowedOrigins = normalizeAllowedOrigins(
    opts.allowedRemoteOrigins ?? splitOrigins(process.env.AI_IMAGE_ALLOWED_ORIGINS),
  );
  const network = opts.network ?? DEFAULT_NETWORK;
  const withUrl = photos
    .filter((photo) => typeof photo.url === 'string' && photo.url.trim().length > 0)
    .slice(0, MAX_PHOTOS);
  const resolved: ResolvedPhoto[] = [];
  // Sharp decoding uses native memory. Keep this sequential so one authenticated
  // request cannot multiply the per-image pixel budget by all six photos at once.
  for (const photo of withUrl) {
    try {
      const bytes = await loadBytes(photo.url as string, localDir, publicBase, allowedOrigins, network);
      if (!bytes) continue;
      const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
      const metadata = await image.metadata();
      if (!metadata.format || !['avif', 'jpeg', 'png', 'webp'].includes(metadata.format)) {
        throw new ImagePolicyError('remote_image_decoded_type_forbidden');
      }
      const jpeg = await image
        .rotate()
        .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      resolved.push({
        type: 'image',
        mediaType: 'image/jpeg',
        dataBase64: jpeg.toString('base64'),
        label: photo.label,
      });
    } catch (error) {
      if (error instanceof ImagePolicyError) throw error;
      continue;
    }
  }
  return resolved;
}

async function loadBytes(
  value: string,
  localDir: string,
  publicBase: string,
  allowedOrigins: ReadonlySet<string>,
  network: ImageResolverNetwork,
): Promise<Buffer | null> {
  if (/^https?:\/\//i.test(value)) {
    if (value.length > 2_048) throw new ImagePolicyError('remote_image_url_too_long');
    return loadRemoteBytes(value, allowedOrigins, network);
  }
  return loadLocalBytes(value, localDir, publicBase);
}

async function loadLocalBytes(
  value: string,
  localDir: string,
  publicBase: string,
): Promise<Buffer | null> {
  const base = publicBase.replace(/\/+$/, '');
  if (!base.startsWith('/') || (value !== base && !value.startsWith(`${base}/`))) {
    throw new ImagePolicyError('local_image_path_forbidden');
  }
  const relative = value.slice(base.length).replace(/^\/+/, '');
  if (!relative) return null;
  const root = await realpath(path.resolve(localDir));
  const target = await realpath(path.resolve(root, relative));
  const escaped = path.relative(root, target);
  if (escaped.startsWith('..') || path.isAbsolute(escaped)) {
    throw new ImagePolicyError('local_image_path_forbidden');
  }
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) return null;
    if (metadata.size > MAX_SOURCE_BYTES) throw new ImagePolicyError('image_too_large');

    // Revalidate after opening and compare the descriptor inode to the current
    // path. This closes the realpath/stat/readFile symlink-swap window while all
    // bytes are read from the already-validated descriptor.
    const openedTarget = await realpath(target);
    const openedRelative = path.relative(root, openedTarget);
    if (openedRelative.startsWith('..') || path.isAbsolute(openedRelative)) {
      throw new ImagePolicyError('local_image_path_forbidden');
    }
    const currentMetadata = await stat(openedTarget);
    if (currentMetadata.dev !== metadata.dev || currentMetadata.ino !== metadata.ino) {
      throw new ImagePolicyError('local_image_path_forbidden');
    }
    return handle.readFile();
  } finally {
    await handle.close();
  }
}

async function loadRemoteBytes(
  value: string,
  allowedOrigins: ReadonlySet<string>,
  network: ImageResolverNetwork,
): Promise<Buffer | null> {
  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  let current: URL;
  try {
    current = new URL(value);
  } catch {
    throw new ImagePolicyError('remote_image_url_invalid');
  }
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    validateRemoteUrl(current, allowedOrigins);
    const address = await resolvePublicAddress(current.hostname, deadline, network);
    const response = await requestPinned(current, address, deadline, network);
    if (isRedirect(response.statusCode)) {
      if (!response.location || redirects === MAX_REDIRECTS) {
        throw new ImagePolicyError('remote_image_redirect_forbidden');
      }
      try {
        current = new URL(response.location, current);
      } catch {
        throw new ImagePolicyError('remote_image_redirect_forbidden');
      }
      continue;
    }
    if (response.statusCode !== 200) return null;
    if (!response.contentType || !ALLOWED_IMAGE_TYPES.has(response.contentType)) {
      throw new ImagePolicyError('remote_image_type_forbidden');
    }
    return response.body;
  }
  return null;
}

function validateRemoteUrl(url: URL, allowedOrigins: ReadonlySet<string>): void {
  if (url.protocol !== 'https:') throw new ImagePolicyError('remote_image_https_required');
  if (url.username || url.password || url.hash) {
    throw new ImagePolicyError('remote_image_url_components_forbidden');
  }
  if (!allowedOrigins.has(url.origin)) throw new ImagePolicyError('remote_image_origin_forbidden');
}

async function resolvePublicAddress(
  hostname: string,
  deadline: number,
  network: ImageResolverNetwork,
): Promise<ResolvedAddress> {
  const host = hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(host);
  const addresses = literalFamily
    ? [{ address: host, family: literalFamily as 4 | 6 }]
    : await withDeadline(
        network.lookup(host),
        deadline,
      );
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new ImagePolicyError('remote_image_address_forbidden');
  }
  return addresses[0];
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return false;
  const hextets = parseIpv6(normalized);
  if (!hextets) return false;
  const [first, second] = hextets;
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) return false;
  if (first === 0x2002) return false;
  return true;
}

function parseIpv6(address: string): number[] | null {
  if (address.includes('.')) return null;
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = [...left, ...Array(missing).fill('0'), ...right];
  if (parts.length !== 8) return null;
  const values = parts.map((part) => Number.parseInt(part, 16));
  return values.every((value, index) => (
    /^[0-9a-f]{1,4}$/.test(parts[index]) && Number.isInteger(value) && value >= 0 && value <= 0xffff
  )) ? values : null;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

interface PinnedResponse {
  statusCode: number;
  location?: string;
  contentType?: string;
  body: Buffer;
}

async function requestPinned(
  url: URL,
  resolved: ResolvedAddress,
  deadline: number,
  network: ImageResolverNetwork,
): Promise<PinnedResponse> {
  const timeout = remaining(deadline);
  return new Promise<PinnedResponse>((resolve, reject) => {
    const request = network.request(url, {
      agent: false,
      headers: {
        Accept: [...ALLOWED_IMAGE_TYPES].join(', '),
        'Accept-Encoding': 'identity',
        Host: url.host,
        'User-Agent': 'AliStore-ImageResolver/1.0',
      },
      lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
      servername: isIP(url.hostname.replace(/^\[|\]$/g, '')) === 0 ? url.hostname : undefined,
      timeout,
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = header(response.headers.location);
      if (isRedirect(statusCode)) {
        // A redirect body is irrelevant and may be infinite. Close the socket
        // before following Location instead of draining attacker-controlled data.
        response.destroy();
        clearTimeout(totalTimer);
        resolve({ statusCode, location, body: Buffer.alloc(0) });
        return;
      }
      const contentType = header(response.headers['content-type'])?.split(';', 1)[0].trim().toLowerCase();
      const declaredSize = Number(header(response.headers['content-length']) ?? '0');
      response.once('error', (error) => {
        clearTimeout(totalTimer);
        reject(error);
      });
      if (Number.isFinite(declaredSize) && declaredSize > MAX_SOURCE_BYTES) {
        response.destroy(new ImagePolicyError('image_too_large'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_SOURCE_BYTES) {
          response.destroy(new ImagePolicyError('image_too_large'));
          return;
        }
        chunks.push(bytes);
      });
      response.once('end', () => {
        clearTimeout(totalTimer);
        resolve({ statusCode, contentType, body: Buffer.concat(chunks, size) });
      });
    });
    const totalTimer = setTimeout(
      () => request.destroy(new Error('remote_image_timeout')),
      timeout,
    );
    request.once('timeout', () => request.destroy(new Error('remote_image_timeout')));
    request.once('error', (error) => {
      clearTimeout(totalTimer);
      reject(error);
    });
    request.end();
  });
}

function splitOrigins(value: string | undefined): string[] {
  return value?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function normalizeAllowedOrigins(values: string[]): ReadonlySet<string> {
  return new Set(values.map((value) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value.replace(/\/$/, '')) {
      throw new Error('invalid_ai_image_allowed_origin');
    }
    return url.origin;
  }));
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const timeout = remaining(deadline);
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('remote_image_timeout')), timeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function remaining(deadline: number): number {
  const value = deadline - Date.now();
  if (value <= 0) throw new Error('remote_image_timeout');
  return value;
}
