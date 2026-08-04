import { staffAuthMe, staffAuthRefresh, type StaffLoginResult } from './api/staff-auth';
import { API_BASE, ApiError } from './api/http';

export const STAFF_SESSION_KEY = 'alistore.staff.auth.v1';
/**
 * Подсказка сессии от сервера (`web-session.ts`): не HttpOnly, `path=/`, 30 дней.
 * Только по её наличию `restoreStaffSession` решает, тянуть ли refresh.
 */
const STAFF_SESSION_HINT_COOKIE = 'alistore_staff_session_hint';

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
  if (process.env.NODE_ENV !== 'production') window.localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
}

/**
 * Гасим подсказку сами, а не ждём Set-Cookie из ответа сервера: ответ может не
 * дойти, а пока подсказка жива, `restoreStaffSession` поднимет сессию обратно
 * через refresh. На общем терминале это значит, что следующий кассир попадает
 * в смену предыдущего.
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
  if (process.env.NODE_ENV !== 'production') window.localStorage.removeItem(STAFF_SESSION_KEY);
  expireStaffSessionHint();
  await revokeStaffSessionOnServer();
}

export async function restoreStaffSession(): Promise<StaffSession | null> {
  if (typeof window === 'undefined') return null;
  if (memorySession) return memorySession;
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
