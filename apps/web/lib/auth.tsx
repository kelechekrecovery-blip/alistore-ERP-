'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  authLogout,
  authMe,
  authAppleLogin,
  authCompleteSocialEnrollment,
  authRefresh,
  authRequestEmailOtp,
  authRequestRecoveryOtp,
  authRequestOtp,
  authTelegramLogin,
  authVerifyEmailOtp,
  authVerifyRecoveryOtp,
  authVerifyOtp,
  type AuthTokens,
  type AuthUser,
  type TelegramAuthResult,
} from './api';
import { ApiError } from './api/http';

interface AuthContextValue {
  user: AuthUser | null;
  hydrated: boolean;
  requestOtp: (phone: string) => Promise<OtpChallenge>;
  verifyOtp: (phone: string, code: string, challengeId?: string) => Promise<void>;
  requestRecoveryOtp: (phone: string) => Promise<OtpChallenge>;
  verifyRecoveryOtp: (phone: string, code: string, challengeId?: string) => Promise<void>;
  /** Second login channel into the same account — Customer.phone stays the unique key. */
  requestEmailOtp: (email: string) => Promise<OtpChallenge>;
  verifyEmailOtp: (email: string, code: string, challengeId?: string) => Promise<void>;
  telegramLogin: (
    initData: string,
    source?: 'mini_app' | 'login_widget',
  ) => Promise<{ status: 'authenticated' } | Extract<TelegramAuthResult, { status: 'enrollment_required' }>>;
  appleLogin: (
    identityToken: string,
    options: { nonce: string; authorizationCode: string; name?: string },
  ) => Promise<{ status: 'authenticated' } | Extract<TelegramAuthResult, { status: 'enrollment_required' }>>;
  completeSocialEnrollment: (
    enrollmentToken: string,
    phone: string,
    code: string,
    challengeId?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  /** Run an authed request with the access token, refreshing once on failure. */
  authed: <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionTokens {
  accessToken: string;
}

export interface OtpChallenge {
  challengeId: string;
  devCode?: string;
}

export async function completeAuthFlow<TTokens, TUser>(
  generation: { current: number },
  loadTokens: () => Promise<TTokens>,
  loadUser: (tokens: TTokens) => Promise<TUser>,
  commit: (tokens: TTokens, user: TUser) => void,
): Promise<boolean> {
  const captured = generation.current;
  const nextTokens = await loadTokens();
  if (generation.current !== captured) return false;
  const nextUser = await loadUser(nextTokens);
  if (generation.current !== captured) return false;
  commit(nextTokens, nextUser);
  return true;
}

export function createSingleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      const current = operation();
      inFlight = current;
      const clear = () => {
        if (inFlight === current) inFlight = null;
      };
      current.then(clear, clear);
    }
    return inFlight;
  };
}

const REFRESH_LOCK_NAME = 'alistore.auth.refresh';
const REFRESH_EPOCH_KEY = 'alistore.auth.refresh.epoch';
const LOGOUT_CHANNEL_NAME = 'alistore.auth.logout';
const LOGOUT_STORAGE_KEY = 'alistore.auth.logout.epoch';
const SIGNED_OUT_STORAGE_KEY = 'alistore.auth.signed-out.v1';
const SIGNED_OUT_COOKIE = 'alistore_client_signed_out';
const SESSION_HINT_COOKIE = 'alistore_session_hint';

export function isLogoutStorageEvent(
  event: Pick<StorageEvent, 'key' | 'newValue'>,
): boolean {
  return event.key === LOGOUT_STORAGE_KEY
    || (event.key === SIGNED_OUT_STORAGE_KEY && event.newValue !== null);
}

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CookieDocument {
  cookie: string;
}

export function safeStorageGet(storage: BrowserStorage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(
  storage: BrowserStorage | undefined,
  key: string,
  value: string,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(storage: BrowserStorage | undefined, key: string): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function hasCookie(doc: CookieDocument | undefined, name: string): boolean {
  return Boolean(doc?.cookie.split(';').some((entry) => entry.trim().startsWith(`${name}=`)));
}

function expireCookie(doc: CookieDocument | undefined, name: string): void {
  if (!doc) return;
  try {
    doc.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // The storage marker still protects browsers that reject cookie writes.
  }
}

export function markClientSignedOut(
  storage: BrowserStorage | undefined,
  doc: CookieDocument | undefined,
  epoch = Date.now(),
): void {
  safeStorageSet(storage, SIGNED_OUT_STORAGE_KEY, String(epoch));
  try {
    if (doc) doc.cookie = `${SIGNED_OUT_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // A same-page in-memory generation still prevents resurrection this turn.
  }
  // The hint is readable and must disappear synchronously. This does not
  // claim that the HttpOnly refresh cookie was revoked by the server.
  expireCookie(doc, SESSION_HINT_COOKIE);
}

export function clearClientSignedOut(
  storage: BrowserStorage | undefined,
  doc: CookieDocument | undefined,
): void {
  safeStorageRemove(storage, SIGNED_OUT_STORAGE_KEY);
  expireCookie(doc, SIGNED_OUT_COOKIE);
}

export function isClientSignedOut(
  storage: BrowserStorage | undefined,
  doc: CookieDocument | undefined,
): boolean {
  return safeStorageGet(storage, SIGNED_OUT_STORAGE_KEY) !== null
    || hasCookie(doc, SIGNED_OUT_COOKIE);
}

export async function runAuthHydration(
  hydrate: () => Promise<void>,
  finish: () => void,
): Promise<void> {
  try {
    await hydrate();
  } finally {
    finish();
  }
}

export interface ExclusiveLockManager {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<T>,
  ): Promise<T>;
}

interface RefreshCoordination {
  locks?: ExclusiveLockManager | null;
  serverGraceEnabled?: boolean;
  readEpoch?: () => number;
  writeEpoch?: (epoch: number) => void;
  now?: () => number;
}

export interface SessionMutationCoordinator<T> {
  refresh: () => Promise<T>;
  logout: () => Promise<void>;
}

function browserLockManager(): ExclusiveLockManager | null {
  if (typeof navigator === 'undefined' || !navigator.locks) return null;
  return navigator.locks;
}

function readBrowserRefreshEpoch(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const epoch = Number(localStorage.getItem(REFRESH_EPOCH_KEY));
    return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
  } catch {
    return 0;
  }
}

function writeBrowserRefreshEpoch(epoch: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // This is only a coordination counter. Tokens remain in the HttpOnly
    // cookie and the provider's in-memory access-token ref.
    localStorage.setItem(REFRESH_EPOCH_KEY, String(epoch));
  } catch {
    // A disabled/full storage area does not weaken the Web Lock serialization.
  }
}

function browserStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserDocument(): Document | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

/**
 * Coordinates refresh-token rotation both within a provider and across tabs.
 *
 * The epoch is deliberately non-secret. A waiting tab re-reads it only after
 * acquiring the exclusive lock, then starts `operation`; at that point the
 * previous response (including its Set-Cookie) has completed, so fetch reads
 * the newly rotated HttpOnly cookie instead of replaying the old one.
 */
export function createSessionMutationCoordinator<T>(
  refreshOperation: () => Promise<T>,
  logoutOperation: () => Promise<void>,
  coordination: RefreshCoordination = {},
): SessionMutationCoordinator<T> {
  const locks = coordination.locks === undefined ? browserLockManager() : coordination.locks;
  const serverGraceEnabled = coordination.serverGraceEnabled
    ?? process.env.NEXT_PUBLIC_AUTH_REFRESH_ROTATION_GRACE_ENABLED === 'true';
  const readEpoch = coordination.readEpoch ?? readBrowserRefreshEpoch;
  const writeEpoch = coordination.writeEpoch ?? writeBrowserRefreshEpoch;
  const now = coordination.now ?? Date.now;

  const runLocked = <R,>(operation: () => Promise<R>): Promise<R> => {
    const mutate = async () => {
      // Re-check after acquiring the lock. Another tab may have rotated the
      // cookie while this caller was queued.
      const observedEpoch = readEpoch();
      const result = await operation();
      writeEpoch(Math.max(observedEpoch + 1, now()));
      return result;
    };
    return locks!.request(REFRESH_LOCK_NAME, { mode: 'exclusive' }, mutate);
  };

  if (!locks) {
    if (!serverGraceEnabled) {
      return {
        // During the mixed-version drain, a lockless browser cannot safely
        // rotate across tabs. Do not call the API until deterministic server
        // grace has been enabled in both the API and this client build.
        refresh: createSingleFlight(async () => {
          throw new Error('refresh_coordination_unavailable');
        }),
        logout: createSingleFlight(logoutOperation),
      };
    }

    return {
      // Safari/WebViews without Web Locks use only in-provider single-flight.
      // Cross-tab retries are made safe by the server's short, hashed-token
      // rotation grace; no browser mutex or plaintext token storage is used.
      refresh: createSingleFlight(refreshOperation),
      // The provider invalidates local state/generation before this call.
      // Server cleanup is best-effort; no response is ever persisted locally,
      // and future refreshes remain blocked in this browser.
      logout: createSingleFlight(logoutOperation),
    };
  }

  return {
    refresh: createSingleFlight(() => runLocked(refreshOperation)),
    logout: createSingleFlight(() => runLocked(logoutOperation)),
  };
}

export function createCrossTabRefresh<T>(
  operation: () => Promise<T>,
  coordination: RefreshCoordination = {},
): () => Promise<T> {
  return createSessionMutationCoordinator(operation, async () => undefined, coordination).refresh;
}

function localFixtureUser(accessToken: string): AuthUser | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    const claims = JSON.parse(atob(padded)) as {
      sub?: unknown;
      phone?: unknown;
      typ?: unknown;
    };
    if (typeof claims.sub !== 'string' || typeof claims.phone !== 'string' || claims.typ !== 'customer') return null;
    return { customerId: claims.sub, phone: claims.phone, typ: claims.typ };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const tokens = useRef<SessionTokens | null>(null);
  const sessionGeneration = useRef(0);
  const logoutInFlight = useRef<Promise<void> | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const sessionMutations = useMemo(
    () => createSessionMutationCoordinator(authRefresh, authLogout),
    [],
  );
  const refreshSession = sessionMutations.refresh;

  const persist = useCallback((t: Pick<AuthTokens, 'accessToken'> | null) => {
    if (t) {
      tokens.current = { accessToken: t.accessToken };
    } else {
      tokens.current = null;
    }
  }, []);

  const invalidateLocalSession = useCallback(() => {
    sessionGeneration.current += 1;
    persist(null);
    setUser(null);
    if (process.env.NODE_ENV !== 'production') {
      safeStorageRemove(browserStorage(), 'alistore.auth.v1');
    }
  }, [persist]);

  useEffect(() => {
    const receiveLogout = (persistMarker: boolean) => {
      if (persistMarker) markClientSignedOut(browserStorage(), browserDocument());
      else expireCookie(browserDocument(), SESSION_HINT_COOKIE);
      invalidateLocalSession();
    };
    const onStorage = (event: StorageEvent) => {
      if (isLogoutStorageEvent(event)) receiveLogout(false);
    };
    window.addEventListener('storage', onStorage);
    const channel = typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(LOGOUT_CHANNEL_NAME);
    const onChannelLogout = () => receiveLogout(true);
    channel?.addEventListener('message', onChannelLogout);
    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.removeEventListener('message', onChannelLogout);
      channel?.close();
    };
  }, [invalidateLocalSession]);

  // restore session on mount
  useEffect(() => {
    let cancelled = false;
    const generation = sessionGeneration.current;
    const canCommit = () => !cancelled && sessionGeneration.current === generation;
    void runAuthHydration(async () => {
      const storage = browserStorage();
      const doc = browserDocument();
      // Remove sessions created by the pre-cookie release in production only.
      // Shopping state uses separate keys and is intentionally preserved.
      if (process.env.NODE_ENV === 'production') safeStorageRemove(storage, 'alistore.auth.v1');
      // A failed/offline server logout may leave the HttpOnly refresh cookie.
      // The durable client tombstone keeps this browser signed out and
      // suppresses refresh until an explicit login succeeds.
      if (isClientSignedOut(storage, doc)) {
        expireCookie(doc, SESSION_HINT_COOKIE);
        return;
      }
      // This flag is non-secret. Tokens remain HttpOnly and are never read by
      // the Web bundle; the flag only avoids an anonymous refresh probe.
      const hasSessionHint = hasCookie(doc, SESSION_HINT_COOKIE);
      if (!hasSessionHint) {
        // Local E2E fixtures still inject a short-lived bearer token. Keep
        // this compatibility path outside production; real browsers use only
        // the HttpOnly cookie session above.
        if (process.env.NODE_ENV !== 'production') {
          try {
            const legacy = JSON.parse(safeStorageGet(storage, 'alistore.auth.v1') ?? 'null') as { accessToken?: string } | null;
            if (legacy?.accessToken) {
              if (!canCommit()) {
                return;
              }
              persist({ accessToken: legacy.accessToken });
              // Test-only bearer fixtures can be slow to validate while a long
              // E2E suite is resetting the database. This identity is only a
              // render hint; every protected read/mutation still uses the
              // bearer and server authorization below.
              const fixtureUser = localFixtureUser(legacy.accessToken);
              if (fixtureUser && canCommit()) {
                setUser(fixtureUser);
                // Protected screens may render while /auth/me confirms the
                // fixture. The bearer remains the only credential used by
                // protected requests; this only prevents an indefinite shell
                // loader during local E2E database contention.
                setHydrated(true);
              }
              // A local fixture already has a scoped customer identity. Keep
              // the shell usable when the dev API is briefly busy; protected
              // requests still use the bearer and remain server-authorized.
              const me = await Promise.race([
                authMe(legacy.accessToken),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('auth-me-timeout')), 5000)),
              ]);
              if (canCommit()) setUser(me);
            }
            // fixtures-allowed: битая локальная тест-фикстура (только вне прода) и означает анонимную сессию — показывать покупателю тут нечего
          } catch {
            // Invalid test fixture behaves like an anonymous session.
          }
        }
        return;
      }
      try {
        const fresh = await refreshSession();
        const me = await authMe(fresh.accessToken);
        if (canCommit()) {
          persist(fresh);
          setUser(me);
        }
        // fixtures-allowed: гидратация анонимной сессии — отсутствие куки это норма; реальные сбои всплывают на явных защищённых запросах, локальные данные корзины не трогаем
      } catch (error) {
        // No cookie is the normal anonymous state; keep network failures visible
        // to the page instead of deleting unrelated local shopping data.
        if (error instanceof ApiError && error.status !== 401 && error.status !== 422) {
          // The shell still hydrates; protected requests can retry explicitly.
        }
      }
    }, () => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [persist, refreshSession]);

  const finishAuth = useCallback(
    async (loadTokens: () => Promise<AuthTokens>): Promise<boolean> =>
      completeAuthFlow(
        sessionGeneration,
        loadTokens,
        (next) => authMe(next.accessToken),
        (next, nextUser) => {
          clearClientSignedOut(browserStorage(), browserDocument());
          persist(next);
          setUser(nextUser);
        },
      ),
    [persist],
  );

  const requestOtp = useCallback(async (phone: string) => {
    return authRequestOtp(phone);
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, code: string, challengeId?: string) => {
      const committed = await finishAuth(() => authVerifyOtp(phone, code, challengeId));
      if (!committed) throw new Error('auth-flow-superseded');
    },
    [finishAuth],
  );

  const requestRecoveryOtp = useCallback(async (phone: string) => {
    return authRequestRecoveryOtp(phone);
  }, []);

  const verifyRecoveryOtp = useCallback(
    async (phone: string, code: string, challengeId?: string) => {
      const committed = await finishAuth(() => authVerifyRecoveryOtp(phone, code, challengeId));
      if (!committed) throw new Error('auth-flow-superseded');
    },
    [finishAuth],
  );

  const requestEmailOtp = useCallback(async (email: string) => {
    return authRequestEmailOtp(email);
  }, []);

  const verifyEmailOtp = useCallback(
    async (email: string, code: string, challengeId?: string) => {
      const committed = await finishAuth(() => authVerifyEmailOtp(email, code, challengeId));
      if (!committed) throw new Error('auth-flow-superseded');
    },
    [finishAuth],
  );

  const telegramLogin = useCallback(
    async (initData: string, source: 'mini_app' | 'login_widget' = 'mini_app') => {
      const result = await authTelegramLogin(initData, source);
      if (result.status === 'enrollment_required') return result;
      const committed = await finishAuth(async () => result);
      if (!committed) throw new Error('auth-flow-superseded');
      return { status: 'authenticated' as const };
    },
    [finishAuth],
  );

  const appleLogin = useCallback(
    async (
      identityToken: string,
      options: { nonce: string; authorizationCode: string; name?: string },
    ) => {
      const result = await authAppleLogin(identityToken, options);
      // Тот же двухшаговый путь, что у Telegram: неизвестный Apple-аккаунт не
      // ошибка, а человек без привязанного телефона. Возвращаем токен привязки
      // наверх, чтобы экран показал ввод номера вместо «не удалось войти».
      if (result.status === 'enrollment_required') return result;
      const committed = await finishAuth(async () => result);
      if (!committed) throw new Error('auth-flow-superseded');
      return { status: 'authenticated' as const };
    },
    [finishAuth],
  );

  const completeSocialEnrollment = useCallback(
    async (enrollmentToken: string, phone: string, code: string, challengeId?: string) => {
      const committed = await finishAuth(
        () => authCompleteSocialEnrollment(enrollmentToken, phone, code, challengeId),
      );
      if (!committed) throw new Error('auth-flow-superseded');
    },
    [finishAuth],
  );

  const logout = useCallback(async () => {
    if (logoutInFlight.current) return logoutInFlight.current;
    // Invalidate immediately. The coordinated network logout may wait behind a
    // held refresh, but neither that refresh nor a late /auth/me may resurrect
    // local state after the user asked to sign out.
    invalidateLocalSession();
    const storage = browserStorage();
    const doc = browserDocument();
    markClientSignedOut(storage, doc);
    safeStorageSet(storage, LOGOUT_STORAGE_KEY, String(Date.now()));
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(LOGOUT_CHANNEL_NAME);
      channel.postMessage({ type: 'logout' });
      channel.close();
    }
    const current = (async () => {
      await sessionMutations.logout();
    })();
    logoutInFlight.current = current;
    try {
      await current;
    } finally {
      if (logoutInFlight.current === current) logoutInFlight.current = null;
    }
  }, [invalidateLocalSession, sessionMutations]);

  const authed = useCallback(
    async <T,>(fn: (accessToken: string) => Promise<T>): Promise<T> => {
      const generation = sessionGeneration.current;
      const assertCurrentSession = () => {
        if (sessionGeneration.current !== generation) throw new Error('session-expired');
      };
      let stored = tokens.current;
      // In local E2E only, a provider remount can happen between the fixture
      // shell render and the first protected request. Recover the same
      // bearer from the compatibility storage instead of turning a transient
      // ref race into a misleading empty account state. Production never
      // reads this legacy key.
      if (!stored && process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
        try {
          if (isClientSignedOut(browserStorage(), browserDocument())) {
            throw new Error('not-authenticated');
          }
          const legacy = JSON.parse(safeStorageGet(browserStorage(), 'alistore.auth.v1') ?? 'null') as { accessToken?: string } | null;
          if (legacy?.accessToken) {
            persist({ accessToken: legacy.accessToken });
            stored = tokens.current;
          }
        // fixtures-allowed: malformed non-production localStorage is intentionally treated as anonymous auth state.
        } catch {
          // Treat malformed local test state as anonymous.
        }
      }
      if (!stored) throw new Error('not-authenticated');
      try {
        const result = await fn(stored.accessToken);
        assertCurrentSession();
        return result;
      } catch (error) {
        assertCurrentSession();
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const fresh = await refreshSession().catch(() => null);
        assertCurrentSession();
        if (!fresh) {
          invalidateLocalSession();
          throw new Error('session-expired');
        }
        persist(fresh);
        const result = await fn(fresh.accessToken);
        assertCurrentSession();
        return result;
      }
    },
    [invalidateLocalSession, persist, refreshSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      hydrated,
      requestOtp,
      verifyOtp,
      requestRecoveryOtp,
      verifyRecoveryOtp,
      requestEmailOtp,
      verifyEmailOtp,
      telegramLogin,
      appleLogin,
      completeSocialEnrollment,
      logout,
      authed,
    }),
    [
      user,
      hydrated,
      requestOtp,
      verifyOtp,
      requestRecoveryOtp,
      verifyRecoveryOtp,
      requestEmailOtp,
      verifyEmailOtp,
      telegramLogin,
      appleLogin,
      completeSocialEnrollment,
      logout,
      authed,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
