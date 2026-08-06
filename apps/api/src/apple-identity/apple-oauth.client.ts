import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { createSign } from 'node:crypto';

const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_ENDPOINT = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
const DEFAULT_TIMEOUT_MS = 5_000;
const CLIENT_SECRET_LIFETIME_SECONDS = 300;

export const APPLE_OAUTH_TEST_OPTIONS = Symbol('APPLE_OAUTH_TEST_OPTIONS');

export interface AppleOAuthTestOptions {
  tokenEndpoint?: string;
  revokeEndpoint?: string;
  timeoutMs?: number;
}

export interface ExchangeAuthorizationCodeInput {
  authorizationCode: string;
  clientId: string;
  redirectUri?: string;
}

export interface RevokeRefreshTokenInput {
  refreshToken: string;
  clientId: string;
}

export type AppleOAuthErrorCode =
  | 'apple_oauth_config_invalid'
  | 'apple_token_exchange_failed'
  | 'apple_revocation_failed';

export class AppleOAuthError extends Error {
  constructor(
    readonly code: AppleOAuthErrorCode,
    readonly reason?: 'invalid_grant' | 'invalid_client' | 'rate_limited' | 'server_error' | 'network',
  ) {
    super(code);
    this.name = 'AppleOAuthError';
  }
}

/** Minimal server-side client for Apple's authorization-code and revocation APIs. */
@Injectable()
export class AppleOAuthClient {
  private readonly teamId: string;
  private readonly keyId: string;
  private readonly privateKey: string;
  private readonly tokenEndpoint: string;
  private readonly revokeEndpoint: string;
  private readonly timeoutMs: number;

  constructor(
    config: ConfigService,
    @Optional() @Inject(APPLE_OAUTH_TEST_OPTIONS)
    options: AppleOAuthTestOptions = {},
  ) {
    if (
      process.env.NODE_ENV !== 'test'
      && (options.tokenEndpoint !== undefined || options.revokeEndpoint !== undefined)
    ) {
      throw new Error('apple_oauth_test_override_forbidden');
    }
    this.teamId = requiredConfig(config, 'APPLE_TEAM_ID');
    this.keyId = requiredConfig(config, 'APPLE_KEY_ID');
    this.privateKey = requiredConfig(config, 'APPLE_PRIVATE_KEY').replace(/\\n/gu, '\n');
    this.tokenEndpoint = options.tokenEndpoint ?? APPLE_TOKEN_ENDPOINT;
    this.revokeEndpoint = options.revokeEndpoint ?? APPLE_REVOKE_ENDPOINT;
    const configuredTimeout = Number(config.get<string>('APPLE_OAUTH_TIMEOUT_MS'));
    const timeout = options.timeoutMs ?? configuredTimeout;
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
  }

  async exchangeAuthorizationCode(
    input: ExchangeAuthorizationCodeInput,
  ): Promise<{ refreshToken: string; identityToken: string }> {
    if (!input.authorizationCode.trim() || !input.clientId.trim()) {
      throw new AppleOAuthError('apple_token_exchange_failed');
    }
    const form = this.baseForm(input.clientId);
    form.set('grant_type', 'authorization_code');
    form.set('code', input.authorizationCode);
    if (input.redirectUri?.trim()) form.set('redirect_uri', input.redirectUri);

    const response = await this.postForm(
      this.tokenEndpoint,
      form,
      'apple_token_exchange_failed',
    );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AppleOAuthError('apple_token_exchange_failed');
    }
    const refreshToken = isRecord(payload) && typeof payload.refresh_token === 'string'
      ? payload.refresh_token
      : '';
    const identityToken = isRecord(payload) && typeof payload.id_token === 'string'
      ? payload.id_token
      : '';
    if (!refreshToken || !identityToken) {
      throw new AppleOAuthError('apple_token_exchange_failed');
    }
    return { refreshToken, identityToken };
  }

  async revokeRefreshToken(input: RevokeRefreshTokenInput): Promise<void> {
    if (!input.refreshToken.trim() || !input.clientId.trim()) {
      throw new AppleOAuthError('apple_revocation_failed');
    }
    const form = this.baseForm(input.clientId);
    form.set('token', input.refreshToken);
    form.set('token_type_hint', 'refresh_token');
    await this.postForm(this.revokeEndpoint, form, 'apple_revocation_failed');
  }

  private baseForm(clientId: string): URLSearchParams {
    return new URLSearchParams({
      client_id: clientId,
      client_secret: this.createClientSecret(clientId),
    });
  }

  private createClientSecret(clientId: string): string {
    const now = Math.floor(Date.now() / 1_000);
    const header = encodeJson({ alg: 'ES256', kid: this.keyId, typ: 'JWT' });
    const payload = encodeJson({
      iss: this.teamId,
      iat: now,
      exp: now + CLIENT_SECRET_LIFETIME_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: clientId,
    });
    const signingInput = `${header}.${payload}`;
    try {
      const signature = createSign('SHA256')
        .update(signingInput)
        .sign({ key: this.privateKey, dsaEncoding: 'ieee-p1363' })
        .toString('base64url');
      return `${signingInput}.${signature}`;
    } catch {
      throw new AppleOAuthError('apple_oauth_config_invalid');
    }
  }

  private async postForm(
    url: string,
    form: URLSearchParams,
    errorCode: Extract<AppleOAuthErrorCode, 'apple_token_exchange_failed' | 'apple_revocation_failed'>,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        const appleError = await safeAppleError(response);
        const reason = appleError === 'invalid_grant'
          ? 'invalid_grant'
          : appleError === 'invalid_client'
            ? 'invalid_client'
            : response.status === 429
              ? 'rate_limited'
              : response.status >= 500
                ? 'server_error'
                : undefined;
        throw new AppleOAuthError(errorCode, reason);
      }
      return response;
    } catch (error) {
      if (error instanceof AppleOAuthError) throw error;
      throw new AppleOAuthError(errorCode, 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeAppleError(response: Response): Promise<string | undefined> {
  try {
    const payload: unknown = await response.json();
    return isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : undefined;
  } catch {
    return undefined;
  }
}

function requiredConfig(config: ConfigService, name: string): string {
  const value = config.get<string>(name)?.trim();
  if (!value) throw new AppleOAuthError('apple_oauth_config_invalid');
  return value;
}

function encodeJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
