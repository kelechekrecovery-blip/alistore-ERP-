import { staffAuthLogout, staffAuthMe, staffAuthRefresh, type StaffLoginResult } from './api/staff-auth';

export const STAFF_SESSION_KEY = 'alistore.staff.auth.v1';

export type StaffSession = StaffLoginResult;

let memorySession: StaffSession | null = null;

export function loadStaffSession(): StaffSession | null {
  if (typeof window === 'undefined') return null;
  if (memorySession) return memorySession;
  if (process.env.NODE_ENV === 'production') return null;
  try {
    const raw = window.localStorage.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffSession>;
    if (!parsed.accessToken || !parsed.role) return null;
    memorySession = {
      accessToken: parsed.accessToken,
      staffId: parsed.staffId ?? '',
      username: parsed.username ?? parsed.role,
      role: parsed.role,
      totpEnabled: Boolean(parsed.totpEnabled),
    };
    return memorySession;
  } catch {
    return null;
  }
}

export function saveStaffSession(session: StaffSession) {
  if (typeof window === 'undefined') return;
  memorySession = session;
  if (process.env.NODE_ENV !== 'production') window.localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
}

export function clearStaffSession() {
  if (typeof window === 'undefined') return;
  memorySession = null;
  if (process.env.NODE_ENV !== 'production') window.localStorage.removeItem(STAFF_SESSION_KEY);
  void staffAuthLogout();
}

export async function restoreStaffSession(): Promise<StaffSession | null> {
  if (typeof window === 'undefined') return null;
  if (memorySession) return memorySession;
  const hasHint = document.cookie.split(';').some((entry) => entry.trim().startsWith('alistore_staff_session_hint='));
  if (!hasHint) return process.env.NODE_ENV === 'production' ? null : loadStaffSession();
  try {
    const refreshed = await staffAuthRefresh();
    const profile = await staffAuthMe(refreshed.accessToken);
    const session: StaffSession = {
      ...refreshed,
      staffId: profile.id,
      username: profile.username,
      role: profile.role,
      totpEnabled: profile.totpEnabled,
    };
    saveStaffSession(session);
    return session;
  } catch {
    memorySession = null;
    return null;
  }
}
