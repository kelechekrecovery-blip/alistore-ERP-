import { staffAuthMe, staffAuthRefresh, type StaffLoginResult } from './api/staff-auth';
import { API_BASE, ApiError } from './api/http';

export const STAFF_SESSION_KEY = 'alistore.staff.auth.v1';
/**
 * Подсказка сессии от сервера (`web-session.ts`): не HttpOnly, `path=/`, 30 дней.
 * Только по её наличию `restoreStaffSession` решает, тянуть ли refresh.
 */
const STAFF_SESSION_HINT_COOKIE = 'alistore_staff_session_hint';
const STAFF_SIGNED_OUT_STORAGE_KEY = 'alistore.staff.signed-out.v1';
const STAFF_SIGNED_OUT_COOKIE = 'alistore_staff_signed_out';

interface StaffBrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StaffCookieDocument {
  cookie: string;
}

export function resolveStaffStorage(
  source: { readonly localStorage: StaffBrowserStorage } | undefined,
): StaffBrowserStorage | undefined {
  try {
    return source?.localStorage;
  } catch {
    return undefined;
  }
}

export function markStaffSignedOut(
  storage: StaffBrowserStorage | undefined,
  doc: StaffCookieDocument | undefined,
  epoch = Date.now(),
): void {
  try { storage?.setItem(STAFF_SIGNED_OUT_STORAGE_KEY, String(epoch)); } catch { /* cookie remains */ }
  try { if (doc) doc.cookie = `${STAFF_SIGNED_OUT_COOKIE}=1; path=/; max-age=31536000; samesite=lax`; } catch { /* storage remains */ }
}

export function clearStaffSignedOut(
  storage: StaffBrowserStorage | undefined,
  doc: StaffCookieDocument | undefined,
): void {
  try { storage?.removeItem(STAFF_SIGNED_OUT_STORAGE_KEY); } catch { /* cookie is also cleared */ }
  try { if (doc) doc.cookie = `${STAFF_SIGNED_OUT_COOKIE}=; path=/; max-age=0; samesite=lax`; } catch { /* storage is enough */ }
}

export function isStaffSignedOut(
  storage: StaffBrowserStorage | undefined,
  doc: StaffCookieDocument | undefined,
): boolean {
  try {
    if (storage?.getItem(STAFF_SIGNED_OUT_STORAGE_KEY) !== null) return true;
  } catch { /* fall through to cookie */ }
  try {
    return Boolean(doc?.cookie.split(';').some((entry) => entry.trim().startsWith(`${STAFF_SIGNED_OUT_COOKIE}=`)));
  } catch {
    return false;
  }
}

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
      point: parsed.point ?? '',
      storePoint: parsed.storePoint ?? {
        id: '',
        code: '',
        name: '',
        inventoryLocation: parsed.point ?? '',
      },
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
  const storage = resolveStaffStorage(window);
  clearStaffSignedOut(storage, document);
  if (process.env.NODE_ENV !== 'production') {
    try { storage?.setItem(STAFF_SESSION_KEY, JSON.stringify(session)); } catch { /* memory session remains */ }
  }
}

/**
 * Best-effort clears a host-scoped copy. The production parent-domain hint can
 * only be cleared reliably by the API response, so the durable signed-out
 * marker above is the actual offline-logout boundary.
 */
function expireStaffSessionHint() {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${STAFF_SESSION_HINT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
}

/**
 * Отзыв сессии на сервере. Не `staffAuthLogout` и не `postJson`: первый глотает
 * и сетевой сбой, и не-2xx (по нему не отличить отозванный refresh от живого),
 * второй парсит тело, а эндпоинт отвечает 204 без тела.
 */
async function revokeStaffSessionOnServer(): Promise<void> {
  const res = await fetch(`${API_BASE}/staff-auth/logout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-alistore-staff-web': '1' },
    credentials: 'include',
    body: '{}',
  });
  if (!res.ok) throw new ApiError(res.status, `staff logout ${res.status}`);
}

/**
 * Выход сотрудника. Локальное состояние (память, localStorage, подсказка) гасим
 * первым и всегда, а отказ сервера пробрасываем: кассиру нельзя показывать
 * «вы вышли», пока его refresh-сессия жива на сервере.
 */
export async function clearStaffSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  memorySession = null;
  const storage = resolveStaffStorage(window);
  markStaffSignedOut(storage, document);
  if (process.env.NODE_ENV !== 'production') {
    try { storage?.removeItem(STAFF_SESSION_KEY); } catch { /* tombstone cookie remains */ }
  }
  expireStaffSessionHint();
  await revokeStaffSessionOnServer();
}

export async function restoreStaffSession(): Promise<StaffSession | null> {
  if (typeof window === 'undefined') return null;
  if (memorySession) return memorySession;
  // A domain-scoped hint may survive an offline logout because JavaScript on
  // admin.ali.kg cannot delete a `.ali.kg` cookie without knowing its Domain.
  // The admin-scoped tombstone wins until a fresh successful login clears it.
  if (isStaffSignedOut(resolveStaffStorage(window), document)) return null;
  const hasHint = document.cookie.split(';').some((entry) => entry.trim().startsWith(`${STAFF_SESSION_HINT_COOKIE}=`));
  if (!hasHint) return process.env.NODE_ENV === 'production' ? null : loadStaffSession();
  try {
    const refreshed = await staffAuthRefresh();
    const profile = await staffAuthMe(refreshed.accessToken);
    const session: StaffSession = {
      ...refreshed,
      staffId: profile.id,
      username: profile.username,
      role: profile.role,
      point: profile.point,
      storePoint: profile.storePoint,
      totpEnabled: profile.totpEnabled,
    };
    saveStaffSession(session);
    return session;
  } catch {
    memorySession = null;
    return null;
  }
}
