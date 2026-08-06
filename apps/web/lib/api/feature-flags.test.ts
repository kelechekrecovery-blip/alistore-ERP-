import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchFeatureFlags,
  resetFeatureFlag,
  setFeatureFlag,
  type FeatureFlagState,
} from './feature-flags';

beforeEach(() => vi.unstubAllGlobals());

describe('feature-flags API client', () => {
  it('uses authenticated owner endpoints and sends mandatory reasons', async () => {
    const state = flag();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(state), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchFeatureFlags('token');
    await setFeatureFlag(state.key, true, 'Enable staged checkout', state.overrideRevision, 'token');
    await resetFeatureFlag(state.key, 'Restore deployment default', state.overrideRevision, 'token');

    expect(fetchMock.mock.calls[0]).toEqual([
      expect.stringContaining('/feature-flags'),
      expect.objectContaining({ headers: { authorization: 'Bearer token' }, cache: 'no-store' }),
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      expect.stringContaining('/feature-flags/supply.to_order_checkout'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ enabled: true, reason: 'Enable staged checkout', expectedRevision: 7 }),
      }),
    ]);
    expect(fetchMock.mock.calls[2]).toEqual([
      expect.stringContaining('/feature-flags/supply.to_order_checkout'),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Restore deployment default', expectedRevision: 7 }),
      }),
    ]);
  });
});

function flag(): FeatureFlagState {
  return {
    key: 'supply.to_order_checkout',
    description: 'Checkout for to-order products',
    owner: 'commerce',
    defaultEnabled: false,
    legacyEnv: 'TO_ORDER_CHECKOUT_ENABLED',
    enabled: false,
    source: 'default',
    overrideRevision: 7,
    fallback: { enabled: false, source: 'default' },
  };
}
