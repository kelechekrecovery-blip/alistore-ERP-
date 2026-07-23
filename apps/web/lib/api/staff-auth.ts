import { API_BASE, getJson, patchAuthJson, postAuthJson, postJson } from './http';

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

/**
 * Нужна ли первичная настройка. Seed не создаёт ни одной учётки, поэтому при
 * пустой базе вход сотрудника показывает форму «создать владельца» вместо
 * тупика на форме логина. При сбое считаем, что настройка не нужна — не
 * подсовывать создание владельца, если статус неизвестен.
 */
export async function staffBootstrapNeeded(): Promise<boolean> {
  try {
    // Публичный статус-маршрут: токена ещё нет, поэтому не через getJson.
    const res = await fetch(`${API_BASE}/staff-auth/bootstrap-status`, { cache: 'no-store' });
    if (!res.ok) return false;
    const body = (await res.json()) as { needsBootstrap?: boolean };
    return Boolean(body.needsBootstrap);
  } catch {
    return false;
  }
}

/** Создание первого владельца (только при пустой базе — сервер закрывает после). */
export function staffBootstrapOwner(username: string, password: string): Promise<StaffLoginResult> {
  return postJson('/staff-auth/bootstrap', { username, password }, { 'x-alistore-staff-web': '1' }, true);
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

export interface StaffAccountRow {
  id: string; username: string; role: StaffRole; point: string; active: boolean; totpEnabled: boolean;
}

/** STAFF-004: full roster incl. deactivated (hr/week is active-only). */
export function fetchStaffAccounts(accessToken: string): Promise<StaffAccountRow[]> {
  return getJson('/staff-auth/staff', accessToken);
}

/** STAFF-004: bring a deactivated account back (idempotent). */
export function reactivateStaffAccount(staffId: string, accessToken: string): Promise<StaffPublicProfile> {
  return postAuthJson(`/staff-auth/staff/${encodeURIComponent(staffId)}/reactivate`, {}, accessToken);
}

/** STAFF-004: promote/demote. 409 last_owner_protected guards the last active owner. */
export function changeStaffRole(
  staffId: string,
  role: StaffRole,
  accessToken: string,
): Promise<StaffPublicProfile> {
  return patchAuthJson(`/staff-auth/staff/${encodeURIComponent(staffId)}/role`, { role }, accessToken);
}

/** STAFF-004: admin password reset; the target's refresh sessions die with the old password. */
export function resetStaffPassword(
  staffId: string,
  password: string,
  accessToken: string,
): Promise<StaffPublicProfile> {
  return postAuthJson(`/staff-auth/staff/${encodeURIComponent(staffId)}/password-reset`, { password }, accessToken);
}
