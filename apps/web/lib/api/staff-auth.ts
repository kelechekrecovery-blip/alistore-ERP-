import { postJson } from './http';

export interface StaffLoginResult {
  accessToken: string;
  role: string;
}

export function staffLogin(username: string, password: string): Promise<StaffLoginResult> {
  return postJson('/staff-auth/login', { username, password });
}
