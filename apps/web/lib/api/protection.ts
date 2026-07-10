import { getJson, patchAuthJson, postAuthJson } from './http';

export type ProtectionStatus = 'requested' | 'reviewing' | 'offered' | 'active' | 'rejected' | 'cancelled';
export type ProtectionPlanType = 'accidental_damage' | 'extended_warranty' | 'full_protection';

export interface DeviceProtectionPolicy {
  id: string;
  customerId: string;
  orderId: string;
  imei: string;
  productName: string;
  planType: ProtectionPlanType;
  status: ProtectionStatus;
  deviceValue: number;
  premium: number | null;
  coverageMonths: number;
  staffNote: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function requestProtection(
  input: { imei: string; planType: ProtectionPlanType; coverageMonths: 12 | 24 },
  accessToken: string,
): Promise<DeviceProtectionPolicy> {
  return postAuthJson('/protection/policies', input, accessToken);
}

export function fetchMyProtection(accessToken: string): Promise<DeviceProtectionPolicy[]> {
  return getJson('/protection/policies/mine', accessToken);
}

export function acceptProtection(id: string, accessToken: string): Promise<DeviceProtectionPolicy> {
  return patchAuthJson(`/protection/policies/${encodeURIComponent(id)}/accept`, {}, accessToken);
}

export function fetchProtectionQueue(accessToken: string): Promise<DeviceProtectionPolicy[]> {
  return getJson('/protection/policies', accessToken);
}

export function updateProtection(
  id: string,
  input: {
    status: 'reviewing' | 'offered' | 'rejected';
    premium?: number;
    staffNote?: string;
  },
  accessToken: string,
): Promise<DeviceProtectionPolicy> {
  return patchAuthJson(`/protection/policies/${encodeURIComponent(id)}`, input, accessToken);
}
