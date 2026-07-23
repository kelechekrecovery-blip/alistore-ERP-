import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, postJson } from './http';

/**
 * Regression: server domain errors carry a machine-readable `code` alongside
 * the human `message` (`{ statusCode, code, message }` — see
 * apps/api/src/common/errors.ts DomainError). The web client must surface
 * that `code` on ApiError so screens can render their own Russian copy
 * instead of trusting whatever prose the server happens to send.
 */
function stubFetch(body: unknown, status: number) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('postJson error handling', () => {
  it('carries the server-provided machine code on ApiError', async () => {
    stubFetch({ statusCode: 422, code: 'otp_invalid', message: 'Неверный код' }, 422);
    await expect(postJson('/auth/email/verify', { email: 'a@b.com', code: '000000' }))
      .rejects.toMatchObject({ status: 422, code: 'otp_invalid', message: 'Неверный код' });
  });

  it('falls back to a generic message when the server omits a code', async () => {
    stubFetch({}, 500);
    const error = await postJson('/x', {}).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBeUndefined();
  });
});
