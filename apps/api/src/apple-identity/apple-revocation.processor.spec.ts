import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { AppleRevocationProcessor } from './apple-revocation.processor';
import { AppleTokenCrypto } from './apple-token.crypto';

describe('AppleRevocationProcessor', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('decrypts a pending grant, revokes it, and deletes the durable credential', async () => {
    const config = makeConfig();
    const envelope = new AppleTokenCrypto(config).encrypt(
      'apple-refresh-secret',
      'kg.alistore.client:apple-subject',
    );
    const grant = {
      id: 'grant-1',
      customerId: null,
      subject: 'apple-subject',
      clientId: 'kg.alistore.client',
      refreshTokenEnvelope: envelope,
      status: 'pending',
      claimToken: null,
      attempts: 0,
      nextAttemptAt: new Date(),
      lastErrorCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const appleRevocationJob = {
      updateMany: jest.fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([grant]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const processor = new AppleRevocationProcessor(
      prismaWithNoExpiredEnrollments(appleRevocationJob),
      config,
    );

    await expect(processor.processBatch()).resolves.toBe(1);
    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const form = request.body as URLSearchParams;
    expect(form.get('token')).toBe('apple-refresh-secret');
    expect(form.get('client_id')).toBe('kg.alistore.client');
    expect(appleRevocationJob.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'grant-1',
        status: 'processing',
        claimToken: expect.any(String),
      },
    });
    expect(JSON.stringify(appleRevocationJob.updateMany.mock.calls)).not.toContain('apple-refresh-secret');
  });

  it('contains transient database failures and allows the next tick to recover', async () => {
    const appleRevocationJob = {
      updateMany: jest.fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const processor = new AppleRevocationProcessor(
      prismaWithNoExpiredEnrollments(appleRevocationJob),
      makeConfig(),
    );
    const tick = (processor as unknown as { tick(): Promise<void> }).tick.bind(processor);

    await expect(tick()).resolves.toBeUndefined();
    await expect(tick()).resolves.toBeUndefined();
    expect(appleRevocationJob.findMany).toHaveBeenCalledTimes(1);
  });
});

function prismaWithNoExpiredEnrollments(appleRevocationJob: object): never {
  return {
    appleRevocationJob,
    $transaction: async (callback: (tx: object) => Promise<unknown>) => callback({
      $queryRaw: jest.fn().mockResolvedValue([]),
    }),
  } as never;
}

function makeConfig(): ConfigService {
  const privateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const values: Record<string, string> = {
    APPLE_TEAM_ID: 'ZYU3F8W56P',
    APPLE_KEY_ID: 'ALISTORE01',
    APPLE_PRIVATE_KEY: privateKey,
    APPLE_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({
      primary: randomBytes(32).toString('base64'),
    }),
    APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'primary',
  };
  return { get: (name: string) => values[name] } as ConfigService;
}
