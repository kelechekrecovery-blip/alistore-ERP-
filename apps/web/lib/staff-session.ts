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
): boolean {
  let storageWritten = false;
  try {
    storage?.setItem(STAFF_SIGNED_OUT_STORAGE_KEY, String(epoch));
    storageWritten = storage?.getItem(STAFF_SIGNED_OUT_STORAGE_KEY) === String(epoch);
  } catch (error) {
    console.warn('Staff sign-out storage marker unavailable', error);
  }

  let cookieWritten = false;
  try {
    if (doc) {
      doc.cookie = `${STAFF_SIGNED_OUT_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
      cookieWritten = doc.cookie.split(';').some((entry) => entry.trim() === `${STAFF_SIGNED_OUT_COOKIE}=1`);
    }
  } catch (error) {
    console.warn('Staff sign-out cookie marker unavailable', error);
  }
  return storageWritten || cookieWritten;
}

export function clearStaffSignedOut(
  storage: StaffBrowserStorage | undefined,
  doc: StaffCookieDocument | undefined,
): boolean {
  let storageCleared = storage === undefined;
  try {
    storage?.removeItem(STAFF_SIGNED_OUT_STORAGE_KEY);
    storageCleared = storage?.getItem(STAFF_SIGNED_OUT_STORAGE_KEY) === null;
  } catch (error) {
    console.warn('Staff sign-out storage marker could not be cleared', error);
  }

  let cookieCleared = doc === undefined;
  try {
    if (doc) {
      doc.cookie = `${STAFF_SIGNED_OUT_COOKIE}=; path=/; max-age=0; samesite=lax`;
      cookieCleared = !doc.cookie.split(';').some((entry) => entry.trim().startsWith(`${STAFF_SIGNED_OUT_COOKIE}=`));
    }
  } catch (error) {
    console.warn('Staff sign-out cookie marker could not be cleared', error);
  }
  return storageCleared && cookieCleared;
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
let sessionGeneration = 0;
let restoreInFlight: Promise<StaffSession | null> | null = null;
let restoreAbortController: AbortController | null = null;
let logoutInFlight = false;

function browserHasSignedOutMarker(): boolean {
  return typeof window !== 'undefined'
    && isStaffSignedOut(resolveStaffStorage(window), document);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STAFF_SIGNED_OUT_STORAGE_KEY || event.newValue === null) return;
    memorySession = null;
    sessionGeneration += 1;
    window.location.reload();
  });
}

export function loadStaffSession(): StaffSession | null {
  if (typeof window === 'undefined') return null;
  if (browserHasSignedOutMarker()) {
    memorySession = null;
    return null;
  }
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
  const storage = resolveStaffStorage(window);
  if (!clearStaffSignedOut(storage, document)) {
    throw new Error('Браузер не разрешил очистить предыдущий выход. Разрешите cookies и хранилище сайта, затем повторите вход.');
  }
  sessionGeneration += 1;
  memorySession = session;
  if (process.env.NODE_ENV !== 'production') {
    try {
      storage?.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      console.warn('Development staff-session persistence unavailable', error);
    }
  }
}

/**
 * Best-effort clears a host-scoped copy. The production parent-domain hint can
 * only be cleared reliably by the API response, so the durable signed-out
 * marker above is the actual offline-logout boundary.
 */
function expireStaffSessionHint(): boolean {
  try {
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${STAFF_SESSION_HINT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
    return !document.cookie.split(';').some((entry) => entry.trim().startsWith(`${STAFF_SESSION_HINT_COOKIE}=`));
  } catch (error) {
    console.warn('Staff session hint could not be cleared locally', error);
    return false;
  }
}

/**
 * Отзыв сессии на сервере. Не `staffAuthLogout` и не `postJson`: первый глотает
 * и сетевой сбой, и не-2xx (по нему не отличить отозванный refresh от живого),
 * второй парсит тело, а эндпоинт отвечает 204 без тела.
 */
async function revokeStaffSessionOnServer(): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${API_BASE}/staff-auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-alistore-staff-web': '1' },
      credentials: 'include',
      body: '{}',
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(res.status, `staff logout ${res.status}`);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/**
 * Выход сотрудника. Локальное состояние (память, localStorage, подсказка) гасим
 * первым и всегда, а отказ сервера пробрасываем: кассиру нельзя показывать
 * «вы вышли», пока его refresh-сессия жива на сервере.
 */
export async function clearStaffSession(onLocallySignedOut?: () => void): Promise<void> {
  if (typeof window === 'undefined') return;
  memorySession = null;
  sessionGeneration += 1;
  const storage = resolveStaffStorage(window);
  const hasDurableSignOut = markStaffSignedOut(storage, document);
  if (process.env.NODE_ENV !== 'production') {
    try {
      storage?.removeItem(STAFF_SESSION_KEY);
    } catch (error) {
      console.warn('Development staff-session cleanup unavailable', error);
    }
  }
  expireStaffSessionHint();
  if (hasDurableSignOut) onLocallySignedOut?.();
  try {
    // A concurrent refresh may rotate the cookie after logout starts. Wait for
    // that refresh to settle, then revoke the newest server-side session.
    restoreAbortController?.abort();
    await restoreInFlight;
    await revokeStaffSessionOnServer();
    if (!hasDurableSignOut) onLocallySignedOut?.();
  } catch (error) {
    if (!hasDurableSignOut) {
      throw new Error('Не удалось безопасно завершить сессию: браузер не сохранил локальный выход, а сервер недоступен.', { cause: error });
    }
    throw error;
  }
}

/**
 * UI-safe logout boundary. A screen must not discard its authenticated state
 * until the server revocation (or its explicit error path) has completed.
 */
export async function logoutStaffSession(
  onSignedOut: () => void,
  onError: (message: string) => void = (message) => window.alert(message),
): Promise<void> {
  if (logoutInFlight) return;
  logoutInFlight = true;
  document.body?.setAttribute('inert', '');
  document.body?.setAttribute('aria-busy', 'true');
  try {
    await clearStaffSession(onSignedOut);
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Не удалось завершить staff-сессию');
  } finally {
    document.body?.removeAttribute('inert');
    document.body?.removeAttribute('aria-busy');
    logoutInFlight = false;
  }
}

export async function restoreStaffSession(): Promise<StaffSession | null> {
  if (typeof window === 'undefined') return null;
  if (browserHasSignedOutMarker()) {
    memorySession = null;
    return null;
  }
  if (memorySession) return memorySession;
  if (restoreInFlight) return restoreInFlight;
  // A domain-scoped hint may survive an offline logout because JavaScript on
  // admin.ali.kg cannot delete a `.ali.kg` cookie without knowing its Domain.
  // The admin-scoped tombstone wins until a fresh successful login clears it.
  const hasHint = document.cookie.split(';').some((entry) => entry.trim().startsWith(`${STAFF_SESSION_HINT_COOKIE}=`));
  if (!hasHint) return process.env.NODE_ENV === 'production' ? null : loadStaffSession();
  const generation = sessionGeneration;
  const abortController = new AbortController();
  restoreAbortController = abortController;
  restoreInFlight = (async () => {
    try {
      const refreshed = await staffAuthRefresh(abortController.signal);
      if (generation !== sessionGeneration || browserHasSignedOutMarker()) return null;
      const profile = await staffAuthMe(refreshed.accessToken, abortController.signal);
      if (generation !== sessionGeneration || browserHasSignedOutMarker()) return null;
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
    } finally {
      if (restoreAbortController === abortController) restoreAbortController = null;
      restoreInFlight = null;
    }
  })();
  return restoreInFlight;
}
