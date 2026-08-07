import { staffAuthMe, staffAuthRefreshWithinLock, type StaffLoginResult } from './api/staff-auth';
import { API_BASE, ApiError, configureStaffAccessTokenRecovery } from './api/http';
import { withStaffAuthCookieLock } from './staff-auth-lock';

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
let memorySessionGeneration = 0;
interface StaffSessionIdentity {
  generation: number;
  staffId: string;
}

let refreshSessionFlight: {
  identity: StaffSessionIdentity;
  marker: object;
  promise: Promise<string>;
} | null = null;
let restoreSessionFlight: {
  generation: number;
  marker: object;
  promise: Promise<StaffSession | null>;
} | null = null;

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
    memorySessionGeneration += 1;
    return memorySession;
  } catch {
    return null;
  }
}

function persistStaffSession(session: StaffSession): void {
  if (typeof window === 'undefined') return;
  const storage = resolveStaffStorage(window);
  clearStaffSignedOut(storage, document);
  if (process.env.NODE_ENV !== 'production') {
    try { storage?.setItem(STAFF_SESSION_KEY, JSON.stringify(session)); } catch { /* memory session remains */ }
  }
}

export function saveStaffSession(session: StaffSession) {
  if (typeof window === 'undefined') return;
  memorySession = session;
  memorySessionGeneration += 1;
  persistStaffSession(session);
}

function discardStaffSessionLocally(): void {
  memorySession = null;
  memorySessionGeneration += 1;
  if (typeof window === 'undefined') return;
  const storage = resolveStaffStorage(window);
  markStaffSignedOut(storage, document);
  if (process.env.NODE_ENV !== 'production') {
    try { storage?.removeItem(STAFF_SESSION_KEY); } catch { /* tombstone cookie remains */ }
  }
  expireStaffSessionHint();
}

function isTerminalRefreshFailure(error: unknown): boolean {
  return error instanceof ApiError && (
    error.code === 'staff_refresh_invalid'
    || error.code === 'staff_refresh_reused'
    || error.code === 'staff_inactive'
  );
}

function sameStaffSessionIdentity(
  identity: StaffSessionIdentity,
  candidate: unknown,
): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const parsed = candidate as Partial<StaffSessionIdentity>;
  return parsed.generation === identity.generation && parsed.staffId === identity.staffId;
}

async function refreshStaffAccessToken(
  rejectedAccessToken: string,
  sessionIdentity: unknown,
): Promise<string> {
  const expectedIdentity: StaffSessionIdentity = {
    generation: memorySessionGeneration,
    staffId: memorySession?.staffId ?? '',
  };
  if (!memorySession || !sameStaffSessionIdentity(expectedIdentity, sessionIdentity)) {
    throw new ApiError(401, 'Staff-сессия была изменена');
  }

  // Another request may already have completed the rotation while this
  // request's 401 was in flight. Reuse the new bearer without rotating twice.
  if (memorySession.accessToken !== rejectedAccessToken) return memorySession.accessToken;
  if (refreshSessionFlight) {
    if (sameStaffSessionIdentity(refreshSessionFlight.identity, expectedIdentity)) {
      return refreshSessionFlight.promise;
    }
    throw new ApiError(401, 'Staff-сессия была изменена');
  }

  const flightMarker = {};
  const operationPromise = withStaffAuthCookieLock(async (lock) => {
    try {
      if (
        !memorySession
        || memorySessionGeneration !== expectedIdentity.generation
        || memorySession.staffId !== expectedIdentity.staffId
      ) {
        throw new ApiError(401, 'Staff-сессия была изменена');
      }
      // This tab may have completed a same-session rotation while waiting for
      // the origin-wide lock. Its current bearer is safe to reuse.
      if (memorySession.accessToken !== rejectedAccessToken) return memorySession.accessToken;

      const refreshed = await staffAuthRefreshWithinLock(lock);
      if (!refreshed.accessToken) throw new ApiError(401, 'Staff refresh не вернул access token');

      // A logout or a new login while refresh was in flight invalidates the
      // originating request. Never replay an old mutation as the new principal.
      if (
        !memorySession
        || memorySessionGeneration !== expectedIdentity.generation
        || memorySession.staffId !== expectedIdentity.staffId
      ) {
        throw new ApiError(401, 'Staff-сессия была изменена');
      }
      if (refreshed.staffId !== expectedIdentity.staffId) {
        discardStaffSessionLocally();
        throw new ApiError(401, 'Staff refresh сменил пользователя', 'staff_refresh_principal_mismatch');
      }
      // Preserve object identity and generation: pages keep the StaffSession
      // object in React state, and concurrent old-token requests belong to this
      // same logical session after a successful rotation.
      if (memorySession.accessToken === rejectedAccessToken) {
        Object.assign(memorySession, refreshed);
        persistStaffSession(memorySession);
      }
      return memorySession.accessToken;
    } catch (error) {
      if (
        memorySessionGeneration === expectedIdentity.generation
        && memorySession?.staffId === expectedIdentity.staffId
        && memorySession?.accessToken === rejectedAccessToken
        && isTerminalRefreshFailure(error)
      ) {
        discardStaffSessionLocally();
      }
      throw error;
    }
  });
  const promise = operationPromise.finally(() => {
    if (refreshSessionFlight?.marker === flightMarker) refreshSessionFlight = null;
  });
  refreshSessionFlight = { identity: expectedIdentity, marker: flightMarker, promise };

  return promise;
}

configureStaffAccessTokenRecovery({
  captureStaffSession: (accessToken) => (
    memorySession?.accessToken === accessToken
      ? { generation: memorySessionGeneration, staffId: memorySession.staffId }
      : undefined
  ),
  refreshStaffAccessToken,
  isStaffSessionCurrent: (accessToken, identity) => Boolean(
    memorySession
    && memorySession.accessToken === accessToken
    && sameStaffSessionIdentity(
      { generation: memorySessionGeneration, staffId: memorySession.staffId },
      identity,
    )
  ),
});

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
 * Строгий отзыв сессии на сервере. Не через `postJson`: тот парсит тело, а
 * эндпоинт отвечает 204 без тела. Сетевой сбой и любой non-2xx пробрасываются,
 * чтобы локальный UI не утверждал успешный выход при живом refresh cookie.
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
  await withStaffAuthCookieLock(async () => {
    discardStaffSessionLocally();
    await revokeStaffSessionOnServer();
  });
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
  const expectedGeneration = memorySessionGeneration;
  if (restoreSessionFlight?.generation === expectedGeneration) return restoreSessionFlight.promise;

  const flightMarker = {};
  const operationPromise = withStaffAuthCookieLock(async (lock): Promise<StaffSession | null> => {
    if (memorySessionGeneration !== expectedGeneration || memorySession) return memorySession;
    try {
      const refreshed = await staffAuthRefreshWithinLock(lock);
      // A successful login/logout owns the newer generation. Do not even look
      // up the restored profile after that boundary, let alone overwrite it.
      if (memorySessionGeneration !== expectedGeneration || memorySession) return memorySession;

      const profile = await staffAuthMe(refreshed.accessToken);
      if (memorySessionGeneration !== expectedGeneration || memorySession) return memorySession;
      if (refreshed.staffId !== profile.id) return null;

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
      // A late failure from the old restore must not erase a session that was
      // saved while its network calls were in flight.
      if (memorySessionGeneration !== expectedGeneration || memorySession) return memorySession;
      return null;
    }
  });
  const promise = operationPromise.finally(() => {
    if (restoreSessionFlight?.marker === flightMarker) restoreSessionFlight = null;
  });
  restoreSessionFlight = { generation: expectedGeneration, marker: flightMarker, promise };
  return promise;
}
