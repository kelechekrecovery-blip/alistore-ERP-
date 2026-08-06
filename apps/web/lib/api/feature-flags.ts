import { deleteAuthJson, getJson, patchAuthJson } from './http';

export type FeatureFlagKey =
  | 'supply.to_order_checkout'
  | 'supply.cancellation'
  | 'supply.auto_refund'
  | 'supply.owner_resolution'
  | 'supply.partial_handover'
  | 'supply.quarantine_conversion';

export type FeatureFlagSource = 'database' | 'environment' | 'default';

export interface FeatureFlagState {
  key: FeatureFlagKey;
  description: string;
  owner: string;
  defaultEnabled: false;
  legacyEnv: string;
  enabled: boolean;
  source: FeatureFlagSource;
}

export function fetchFeatureFlags(accessToken: string): Promise<FeatureFlagState[]> {
  return getJson('/feature-flags', accessToken);
}

export function setFeatureFlag(
  key: FeatureFlagKey,
  enabled: boolean,
  reason: string,
  accessToken: string,
): Promise<FeatureFlagState> {
  return patchAuthJson(`/feature-flags/${encodeURIComponent(key)}`, { enabled, reason }, accessToken);
}

export function resetFeatureFlag(
  key: FeatureFlagKey,
  reason: string,
  accessToken: string,
): Promise<FeatureFlagState> {
  return deleteAuthJson(`/feature-flags/${encodeURIComponent(key)}`, { reason }, accessToken);
}
