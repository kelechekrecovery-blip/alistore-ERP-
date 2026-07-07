import type { StaffLoginResult } from './api/staff-auth';

export const STAFF_SESSION_KEY = 'alistore.staff.auth.v1';

export type StaffSession = StaffLoginResult;

export function loadStaffSession(): StaffSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffSession>;
    if (!parsed.accessToken || !parsed.role) return null;
    return {
      accessToken: parsed.accessToken,
      staffId: parsed.staffId ?? '',
      username: parsed.username ?? parsed.role,
      role: parsed.role,
      totpEnabled: Boolean(parsed.totpEnabled),
    };
  } catch {
    return null;
  }
}

export function saveStaffSession(session: StaffSession) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
}

export function clearStaffSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STAFF_SESSION_KEY);
}
