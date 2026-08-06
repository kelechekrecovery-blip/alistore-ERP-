import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

const originalRevision = process.env.RENDER_GIT_COMMIT;

afterEach(() => {
  if (originalRevision === undefined) delete process.env.RENDER_GIT_COMMIT;
  else process.env.RENDER_GIT_COMMIT = originalRevision;
});

describe('GET /healthz', () => {
  it('keeps the body minimal and exposes the deployed revision in a header', async () => {
    process.env.RENDER_GIT_COMMIT = '0123456789abcdef';

    const response = GET();

    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(response.headers.get('x-alistore-revision')).toBe('0123456789abcdef');
  });
});
