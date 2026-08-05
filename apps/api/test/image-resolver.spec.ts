import * as https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import sharp from 'sharp';
import { GradePhotosDto } from '../src/ai/grading.dto';
import {
  ImagePolicyError,
  ImageResolverNetwork,
  resolvePhotoImages,
} from '../src/ai/llm/image-resolver';

describe('AI image resolver network policy', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    'https://127.0.0.1/photo.jpg',
    'https://2130706433/photo.jpg',
    'https://0x7f000001/photo.jpg',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.1/photo.jpg',
    'https://[::1]/photo.jpg',
    'https://[::ffff:127.0.0.1]/photo.jpg',
  ])('rejects non-public literal address %s before transport', async (url) => {
    const network = mockNetwork([]);
    await expect(resolvePhotoImages([{ url }], {
      allowedRemoteOrigins: [new URL(url).origin],
      network,
    })).rejects.toBeInstanceOf(ImagePolicyError);
    expect(network.request).not.toHaveBeenCalled();
  });

  it('denies every remote origin when the allowlist is empty', async () => {
    const network = mockNetwork([]);
    await expect(resolvePhotoImages([{ url: 'https://cdn.example.test/photo.jpg' }], {
      allowedRemoteOrigins: [],
      network,
    })).rejects.toMatchObject({ code: 'remote_image_origin_forbidden' });
    expect(network.request).not.toHaveBeenCalled();
  });

  it.each([
    'http://cdn.example.test/photo.jpg',
    'https://user:pass@cdn.example.test/photo.jpg',
    'https://cdn.example.test/photo.jpg#secret-fragment',
  ])('rejects unsafe URL components in %s', async (url) => {
    const network = mockNetwork([{ address: '93.184.216.34', family: 4 }]);
    await expect(resolvePhotoImages([{ url }], {
      allowedRemoteOrigins: ['https://cdn.example.test'],
      network,
    })).rejects.toBeInstanceOf(ImagePolicyError);
    expect(network.request).not.toHaveBeenCalled();
  });

  it('rejects DNS answers containing both public and private addresses', async () => {
    const network = mockNetwork([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    await expect(resolvePhotoImages([{ url: 'https://cdn.example.test/photo.jpg' }], {
      allowedRemoteOrigins: ['https://cdn.example.test'],
      network,
    })).rejects.toMatchObject({ code: 'remote_image_address_forbidden' });
    expect(network.request).not.toHaveBeenCalled();
  });

  it('revalidates a redirect destination and blocks a private hop', async () => {
    const network = mockNetwork([{ address: '93.184.216.34', family: 4 }], [{
      status: 302,
      headers: { location: 'https://169.254.169.254/latest/meta-data' },
    }]);

    await expect(resolvePhotoImages([{ url: 'https://cdn.example.test/photo.jpg' }], {
      allowedRemoteOrigins: ['https://cdn.example.test'],
      network,
    })).rejects.toMatchObject({ code: 'remote_image_origin_forbidden' });
    expect(network.request).toHaveBeenCalledTimes(1);
  });

  it('pins an allowed public address and returns a bounded JPEG', async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
    const network = mockNetwork([{ address: '93.184.216.34', family: 4 }], [{
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(png.length) },
      body: png,
    }]);

    const images = await resolvePhotoImages([{
      url: 'https://cdn.example.test/photo.png?signature=kept',
      label: 'front',
    }], { allowedRemoteOrigins: ['https://cdn.example.test'], network });

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ mediaType: 'image/jpeg', label: 'front' });
    const options = (network.request as jest.Mock).mock.calls[0][1] as https.RequestOptions;
    expect(options.agent).toBe(false);
    expect(options.lookup).toEqual(expect.any(Function));
    expect(options.servername).toBe('cdn.example.test');
    expect((options.headers as Record<string, string>).Host).toBe('cdn.example.test');
    const lookup = options.lookup as NonNullable<https.RequestOptions['lookup']>;
    const pinned = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      lookup('cdn.example.test', {}, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address: String(address), family: Number(family) });
      });
    });
    expect(pinned).toEqual({ address: '93.184.216.34', family: 4 });
    expect(String((network.request as jest.Mock).mock.calls[0][0])).toContain('signature=kept');
  });

  it('stops after three redirects even when every hop stays on the allowlist', async () => {
    const network = mockNetwork([{ address: '93.184.216.34', family: 4 }],
      Array.from({ length: 4 }, (_, index) => ({
        status: 302,
        headers: { location: `https://cdn.example.test/hop-${index + 1}.jpg` },
      })),
    );

    await expect(resolvePhotoImages([{ url: 'https://cdn.example.test/start.jpg' }], {
      allowedRemoteOrigins: ['https://cdn.example.test'],
      network,
    })).rejects.toMatchObject({ code: 'remote_image_redirect_forbidden' });
    expect(network.request).toHaveBeenCalledTimes(4);
  });

  it('destroys a redirect response without waiting for its body to end', async () => {
    let redirectResponse: PassThrough | undefined;
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
    const network = mockNetwork([{ address: '93.184.216.34', family: 4 }], [{
      status: 302,
      headers: { location: '/final.png' },
      neverEnd: true,
      capture: (response) => { redirectResponse = response; },
    }, {
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: png,
    }]);

    await expect(resolvePhotoImages([{ url: 'https://cdn.example.test/start.png' }], {
      allowedRemoteOrigins: ['https://cdn.example.test'],
      network,
    })).resolves.toHaveLength(1);
    expect(redirectResponse?.destroyed).toBe(true);
  });

  it('resolves and decodes photos sequentially to bound native memory', async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
    const callbacks: Array<(response: PassThrough & {
      statusCode: number;
      headers: Record<string, string>;
    }) => void> = [];
    const request = jest.fn((
      _url: URL,
      _options: https.RequestOptions,
      callback: (response: PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      }) => void,
    ) => {
      callbacks.push(callback);
      const emitter = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (error: Error) => void;
      };
      emitter.end = () => undefined;
      emitter.destroy = (error) => emitter.emit('error', error);
      return emitter;
    });
    const network: ImageResolverNetwork = {
      lookup: jest.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
      request: request as unknown as ImageResolverNetwork['request'],
    };

    const run = resolvePhotoImages([
      { url: 'https://cdn.example.test/one.png' },
      { url: 'https://cdn.example.test/two.png' },
    ], { allowedRemoteOrigins: ['https://cdn.example.test'], network });
    await waitFor(() => callbacks.length === 1);
    expect(request).toHaveBeenCalledTimes(1);
    completeImageResponse(callbacks[0], png);
    await waitFor(() => callbacks.length === 2);
    expect(request).toHaveBeenCalledTimes(2);
    completeImageResponse(callbacks[1], png);
    await expect(run).resolves.toHaveLength(2);
  });

  it('rejects disallowed media types and oversized declared bodies', async () => {
    const firstNetwork = mockNetwork([{ address: '93.184.216.34', family: 4 }], [{
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: Buffer.from('<html/>'),
    }]);
    await expect(resolvePhotoImages([{ url: 'https://cdn.example.test/not-image' }], {
      allowedRemoteOrigins: ['https://cdn.example.test'],
      network: firstNetwork,
    })).rejects.toMatchObject({ code: 'remote_image_type_forbidden' });

    const secondNetwork = mockNetwork([{ address: '93.184.216.34', family: 4 }], [{
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(8 * 1024 * 1024 + 1) },
    }]);
    await expect(resolvePhotoImages([{ url: 'https://cdn.example.test/large.jpg' }], {
      allowedRemoteOrigins: ['https://cdn.example.test'],
      network: secondNetwork,
    })).rejects.toMatchObject({ code: 'image_too_large' });

    const chunkedNetwork = mockNetwork([{ address: '93.184.216.34', family: 4 }], [{
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      body: Buffer.alloc(8 * 1024 * 1024 + 1),
    }]);
    await expect(resolvePhotoImages([{ url: 'https://cdn.example.test/chunked-large.jpg' }], {
      allowedRemoteOrigins: ['https://cdn.example.test'],
      network: chunkedNetwork,
    })).rejects.toMatchObject({ code: 'image_too_large' });
  });

  it('applies one total deadline to DNS before any request starts', async () => {
    jest.useFakeTimers();
    try {
      const network: ImageResolverNetwork = {
        lookup: jest.fn(() => new Promise(() => undefined)),
        request: jest.fn() as unknown as ImageResolverNetwork['request'],
      };
      const run = resolvePhotoImages([{ url: 'https://cdn.example.test/slow.jpg' }], {
        allowedRemoteOrigins: ['https://cdn.example.test'],
        network,
      });
      await jest.advanceTimersByTimeAsync(8_000);
      await expect(run).resolves.toEqual([]);
      expect(network.request).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects more than six photos at the DTO boundary', async () => {
    const dto = plainToInstance(GradePhotosDto, {
      photos: Array.from({ length: 7 }, (_, index) => ({ label: `photo-${index}` })),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'photos')).toBe(true);
  });
});

interface FakeResponse {
  status: number;
  headers?: Record<string, string>;
  body?: Buffer;
  neverEnd?: boolean;
  capture?: (response: PassThrough) => void;
}

function mockNetwork(
  addresses: Array<{ address: string; family: 4 | 6 }>,
  responses: FakeResponse[] = [],
): ImageResolverNetwork {
  const request = jest.fn(((
    _url: URL,
    _options: https.RequestOptions,
    callback: (response: PassThrough & {
      statusCode: number;
      headers: Record<string, string>;
    }) => void,
  ) => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected_request');
    const request = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error: Error) => void;
    };
    request.destroy = (error) => request.emit('error', error);
    request.end = () => queueMicrotask(() => {
      const response = new PassThrough() as PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = next.status;
      response.headers = next.headers ?? {};
      next.capture?.(response);
      callback(response);
      if (!next.neverEnd) response.end(next.body ?? Buffer.alloc(0));
    });
    return request;
  }) as never);
  return {
    lookup: jest.fn(async () => addresses),
    request: request as unknown as ImageResolverNetwork['request'],
  };
}

function completeImageResponse(
  callback: (response: PassThrough & {
    statusCode: number;
    headers: Record<string, string>;
  }) => void,
  body: Buffer,
): void {
  const response = new PassThrough() as PassThrough & {
    statusCode: number;
    headers: Record<string, string>;
  };
  response.statusCode = 200;
  response.headers = { 'content-type': 'image/png' };
  callback(response);
  response.end(body);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('condition_not_reached');
}
