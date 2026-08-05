import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadEvidenceImages } from './evidence';

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadEvidenceImages', () => {
  it('keeps each file key stable when a partial retry removes or reorders files', async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify({
        entityType: 'support',
        entityId: 'ticket-1',
        asset: { key: 'asset', url: 'https://example.test/asset', width: 1, height: 1, bytes: 1, format: 'webp' },
        label: 'support_attachment',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const files = [
      new Blob(['first'], { type: 'image/png' }) as File,
      new Blob(['second'], { type: 'image/png' }) as File,
    ];
    const upload = (selectedFiles: File[]) => uploadEvidenceImages({
      files: selectedFiles,
      entityType: 'support',
      entityId: 'ticket-1',
      idempotencyKeyPrefix: 'support:attempt-1',
    });
    await upload(files);
    await upload([files[1], files[0]]);
    await upload([files[1]]);

    expect(calls).toHaveLength(5);
    const keys = calls.map((call) => (call.headers as Record<string, string>)['Idempotency-Key']);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).toBe(keys[1]);
    expect(keys[3]).toBe(keys[0]);
    expect(keys[4]).toBe(keys[1]);
    expect(keys.every((key) => key.length <= 128)).toBe(true);
  });
});
