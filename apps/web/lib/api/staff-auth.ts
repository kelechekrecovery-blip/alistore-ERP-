import { API_BASE, getJson, postAuthJson, postJson } from './http';

export interface StaffLoginResult {
  accessToken: string;
  refreshToken?: string;
  staffId: string;
  username: string;
  role: string;
  totpEnabled: boolean;
}

export interface StaffPublicProfile {
  id: string;
  username: string;
  role: string;
  active: boolean;
  totpEnabled: boolean;
}

export interface StaffTotpSetupResult {
  secret: string;
  otpauthUrl: string;
  totpEnabled: boolean;
}

export function staffLogin(username: string, password: string): Promise<StaffLoginResult> {
  return postJson('/staff-auth/login', { username, password }, { 'x-alistore-staff-web': '1' }, true);
}

export function staffAuthRefresh(): Promise<StaffLoginResult> {
  return postJson('/staff-auth/refresh', {}, { 'x-alistore-staff-web': '1' }, true);
}

export async function staffAuthLogout(): Promise<void> {
  await fetch(`${API_BASE}/staff-auth/logout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-alistore-staff-web': '1' },
    credentials: 'include',
    body: '{}',
  }).catch(() => undefined);
}

export function staffAuthMe(accessToken: string): Promise<StaffPublicProfile> {
  return getJson('/staff-auth/me', accessToken);
}

export function staffTotpSetup(accessToken: string): Promise<StaffTotpSetupResult> {
  return postAuthJson('/staff-auth/2fa/setup', {}, accessToken);
}

export function staffTotpEnable(
  accessToken: string,
  token: string,
): Promise<StaffPublicProfile> {
  return postAuthJson('/staff-auth/2fa/enable', { token }, accessToken);
}

export function staffTotpDisable(
  accessToken: string,
  token: string,
): Promise<StaffPublicProfile> {
  return postAuthJson('/staff-auth/2fa/disable', { token }, accessToken);
}

/** Prisma Role enum — keep in sync with apps/api/prisma/schema.prisma. */
export const STAFF_ROLES = [
  'seller',
  'senior_seller',
  'cashier',
  'warehouse',
  'service',
  'technician',
  'courier',
  'marketer',
  'admin',
  'owner',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface CreateStaffInput {
  username: string;
  password: string;
  role: StaffRole;
  point: string;
}

/** STAFF-001/002 account admin — every call requires the owner-only staff:manage grant. */
export function createStaffAccount(
  input: CreateStaffInput,
  accessToken: string,
): Promise<StaffPublicProfile> {
  return postAuthJson('/staff-auth/staff', input, accessToken);
}

/** 409 surfaces the blockers (open cash shift, active courier deliveries) in the message. */
export function deactivateStaffAccount(
  staffId: string,
  accessToken: string,
): Promise<StaffPublicProfile> {
  return postAuthJson(`/staff-auth/staff/${encodeURIComponent(staffId)}/deactivate`, {}, accessToken);
}

export function resetStaffTotp(
  staffId: string,
  accessToken: string,
): Promise<StaffPublicProfile> {
  return postAuthJson(`/staff-auth/staff/${encodeURIComponent(staffId)}/totp-reset`, {}, accessToken);
}
