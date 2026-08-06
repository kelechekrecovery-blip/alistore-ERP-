import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import { AppleOAuthClient, AppleOAuthError } from './apple-oauth.client';

describe('AppleOAuthClient', () => {
  const originalFetch = global.fetch;
  let privateKey: string;

  beforeAll(() => {
    privateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('exchanges an authorization code with a correctly scoped ES256 client secret', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(200, {
      access_token: 'short-lived-access',
      refresh_token: 'apple-refresh-token',
      id_token: 'apple.identity.token',
      token_type: 'Bearer',
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient();

    await expect(client.exchangeAuthorizationCode({
      authorizationCode: 'one-time-code',
      clientId: 'kg.alistore.web',
      redirectUri: 'https://ali.kg/login',
    })).resolves.toEqual({
      refreshToken: 'apple-refresh-token',
      identityToken: 'apple.identity.token',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://appleid.apple.com/auth/token');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    const form = init.body as URLSearchParams;
    expect(Object.fromEntries(form.entries())).toMatchObject({
      grant_type: 'authorization_code',
      code: 'one-time-code',
      client_id: 'kg.alistore.web',
      redirect_uri: 'https://ali.kg/login',
    });
    const [header, payload, signature] = form.get('client_secret')!.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'APPLE-KEY-1',
      typ: 'JWT',
    });
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
    expect(claims).toMatchObject({
      iss: 'APPLE-TEAM-1',
      sub: 'kg.alistore.web',
      aud: 'https://appleid.apple.com',
    });
    expect(Number(claims.exp) - Number(claims.iat)).toBeLessThanOrEqual(300);
    expect(Buffer.from(signature, 'base64url')).toHaveLength(64);
  });

  it('omits redirect_uri when the native flow does not supply one', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(200, {
      refresh_token: 'native-refresh',
      id_token: 'native.identity.token',
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await makeClient().exchangeAuthorizationCode({
      authorizationCode: 'native-code',
      clientId: 'kg.alistore.client',
    });

    const form = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(form.get('redirect_uri')).toBeNull();
    expect(form.get('client_id')).toBe('kg.alistore.client');
  });

  it('revokes a refresh token with the Apple refresh-token hint', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(200, undefined));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(makeClient().revokeRefreshToken({
      refreshToken: 'refresh-secret',
      clientId: 'kg.alistore.client',
    })).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0][0]).toBe('https://appleid.apple.com/auth/revoke');
    const form = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(Object.fromEntries(form.entries())).toMatchObject({
      token: 'refresh-secret',
      token_type_hint: 'refresh_token',
      client_id: 'kg.alistore.client',
    });
    expect(form.get('client_secret')?.split('.')).toHaveLength(3);
  });

  it.each([
    ['exchange', () => makeClient().exchangeAuthorizationCode({ authorizationCode: 'secret-code', clientId: 'client' })],
    ['revocation', () => makeClient().revokeRefreshToken({ refreshToken: 'secret-refresh', clientId: 'client' })],
  ])('sanitizes %s HTTP failures', async (_name, operation) => {
    global.fetch = jest.fn().mockResolvedValue(response(500, { error: 'leaked-provider-body' })) as unknown as typeof fetch;

    const error = await operation().catch((caught) => caught) as AppleOAuthError;

    expect(error).toBeInstanceOf(AppleOAuthError);
    expect(error.message).toBe(error.code);
    expect(JSON.stringify(error)).not.toContain('secret');
    expect(JSON.stringify(error)).not.toContain('leaked-provider-body');
  });

  it('fails closed when Apple does not return a refresh token', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, {
      access_token: 'access-only',
      id_token: 'apple.identity.token',
    })) as unknown as typeof fetch;

    await expect(makeClient().exchangeAuthorizationCode({
      authorizationCode: 'code',
      clientId: 'client',
    })).rejects.toMatchObject({ code: 'apple_token_exchange_failed' });
  });

  it('fails closed when Apple does not return an identity token', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, {
      refresh_token: 'unbound-refresh-token',
    })) as unknown as typeof fetch;

    await expect(makeClient().exchangeAuthorizationCode({
      authorizationCode: 'code',
      clientId: 'client',
    })).rejects.toMatchObject({ code: 'apple_token_exchange_failed' });
  });

  it('rejects empty credentials before making a provider request', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = makeClient();

    await expect(client.exchangeAuthorizationCode({ authorizationCode: '', clientId: 'client' }))
      .rejects.toMatchObject({ code: 'apple_token_exchange_failed' });
    await expect(client.revokeRefreshToken({ refreshToken: 'refresh', clientId: '' }))
      .rejects.toMatchObject({ code: 'apple_revocation_failed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails with a sanitized configuration error for a missing or invalid signing key', async () => {
    expect(() => new AppleOAuthClient({ get: () => undefined } as unknown as ConfigService))
      .toThrow(new AppleOAuthError('apple_oauth_config_invalid'));
    const client = new AppleOAuthClient({
      get: (key: string) => ({
        APPLE_TEAM_ID: 'team',
        APPLE_KEY_ID: 'key',
        APPLE_PRIVATE_KEY: 'not-a-private-key',
      })[key],
    } as ConfigService);

    await expect(client.exchangeAuthorizationCode({ authorizationCode: 'code', clientId: 'client' }))
      .rejects.toMatchObject({ code: 'apple_oauth_config_invalid' });
  });

  it('aborts a provider request at the configured timeout', async () => {
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    const client = makeClient({ timeoutMs: 5 });

    await expect(client.revokeRefreshToken({
      refreshToken: 'refresh',
      clientId: 'client',
    })).rejects.toMatchObject({ code: 'apple_revocation_failed' });
  });

  it('allows endpoint overrides only in tests', () => {
    const oldEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => makeClient({ tokenEndpoint: 'https://apple.test/token' }))
        .toThrow('apple_oauth_test_override_forbidden');
    } finally {
      process.env.NODE_ENV = oldEnvironment;
    }
  });

  function makeClient(overrides: ConstructorParameters<typeof AppleOAuthClient>[1] = {}) {
    const values: Record<string, string> = {
      APPLE_TEAM_ID: 'APPLE-TEAM-1',
      APPLE_KEY_ID: 'APPLE-KEY-1',
      APPLE_PRIVATE_KEY: privateKey,
    };
    return new AppleOAuthClient({
      get: (key: string) => values[key],
    } as ConfigService, overrides);
  }
});

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
