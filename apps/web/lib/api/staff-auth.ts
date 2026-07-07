import { postAuthJson, postJson } from './http';

export interface StaffLoginResult {
  accessToken: string;
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
  return postJson('/staff-auth/login', { username, password });
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
