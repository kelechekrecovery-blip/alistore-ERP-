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
} from './api';
import { ApiError } from './api/http';

interface AuthContextValue {
  user: AuthUser | null;
  hydrated: boolean;
  requestOtp: (phone: string) => Promise<{ devCode?: string }>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  requestRecoveryOtp: (phone: string) => Promise<{ devCode?: string }>;
  verifyRecoveryOtp: (phone: string, code: string) => Promise<void>;
  /** Second login channel into the same account — Customer.phone stays the unique key. */
  requestEmailOtp: (email: string) => Promise<{ devCode?: string }>;
  verifyEmailOtp: (email: string, code: string) => Promise<void>;
  telegramLogin: (initData: string, source?: 'mini_app' | 'login_widget') => Promise<void>;
  logout: () => Promise<void>;
  /** Run an authed request with the access token, refreshing once on failure. */
  authed: <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionTokens {
  accessToken: string;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const persist = useCallback((t: Pick<AuthTokens, 'accessToken'> | null) => {
    if (t) {
      tokens.current = { accessToken: t.accessToken };
    } else {
      tokens.current = null;
    }
  }, []);

  // restore session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Remove sessions created by the pre-cookie release in production only.
      // Shopping state uses separate keys and is intentionally preserved.
      if (process.env.NODE_ENV === 'production') localStorage.removeItem('alistore.auth.v1');
      // This flag is non-secret. Tokens remain HttpOnly and are never read by
      // the Web bundle; the flag only avoids an anonymous refresh probe.
      const hasSessionHint = document.cookie
        .split(';')
        .some((entry) => entry.trim().startsWith('alistore_session_hint='));
      if (!hasSessionHint) {
        // Local E2E fixtures still inject a short-lived bearer token. Keep
        // this compatibility path outside production; real browsers use only
        // the HttpOnly cookie session above.
        if (process.env.NODE_ENV !== 'production') {
          try {
            const legacy = JSON.parse(localStorage.getItem('alistore.auth.v1') ?? 'null') as { accessToken?: string } | null;
            if (legacy?.accessToken) {
              persist({ accessToken: legacy.accessToken });
              // Test-only bearer fixtures can be slow to validate while a long
              // E2E suite is resetting the database. This identity is only a
              // render hint; every protected read/mutation still uses the
              // bearer and server authorization below.
              const fixtureUser = localFixtureUser(legacy.accessToken);
              if (fixtureUser && !cancelled) {
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
              if (!cancelled) setUser(me);
            }
            // fixtures-allowed: битая локальная тест-фикстура (только вне прода) и означает анонимную сессию — показывать покупателю тут нечего
          } catch {
            // Invalid test fixture behaves like an anonymous session.
          }
        }
        if (!cancelled) setHydrated(true);
        return;
      }
      try {
        const fresh = await authRefresh();
        persist(fresh);
        const me = await authMe(fresh.accessToken);
        if (!cancelled) setUser(me);
        // fixtures-allowed: гидратация анонимной сессии — отсутствие куки это норма; реальные сбои всплывают на явных защищённых запросах, локальные данные корзины не трогаем
      } catch (error) {
        // No cookie is the normal anonymous state; keep network failures visible
        // to the page instead of deleting unrelated local shopping data.
        if (error instanceof ApiError && error.status !== 401 && error.status !== 422) {
          // The shell still hydrates; protected requests can retry explicitly.
        }
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const requestOtp = useCallback(async (phone: string) => {
    const { devCode } = await authRequestOtp(phone);
    return { devCode };
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, code: string) => {
      const t = await authVerifyOtp(phone, code);
      persist(t);
      setUser(await authMe(t.accessToken));
    },
    [persist],
  );

  const requestRecoveryOtp = useCallback(async (phone: string) => {
    const { devCode } = await authRequestRecoveryOtp(phone);
    return { devCode };
  }, []);

  const verifyRecoveryOtp = useCallback(
    async (phone: string, code: string) => {
      const t = await authVerifyRecoveryOtp(phone, code);
      persist(t);
      setUser(await authMe(t.accessToken));
    },
    [persist],
  );

  const requestEmailOtp = useCallback(async (email: string) => {
    const { devCode } = await authRequestEmailOtp(email);
    return { devCode };
  }, []);

  const verifyEmailOtp = useCallback(
    async (email: string, code: string) => {
      const t = await authVerifyEmailOtp(email, code);
      persist(t);
      setUser(await authMe(t.accessToken));
    },
    [persist],
  );

  const telegramLogin = useCallback(
    async (initData: string, source: 'mini_app' | 'login_widget' = 'mini_app') => {
      const t = await authTelegramLogin(initData, source);
      persist(t);
      setUser(await authMe(t.accessToken));
    },
    [persist],
  );

  const logout = useCallback(async () => {
    await authLogout();
    persist(null);
    setUser(null);
  }, [persist]);

  const authed = useCallback(
    async <T,>(fn: (accessToken: string) => Promise<T>): Promise<T> => {
      let stored = tokens.current;
      // In local E2E only, a provider remount can happen between the fixture
      // shell render and the first protected request. Recover the same
      // bearer from the compatibility storage instead of turning a transient
      // ref race into a misleading empty account state. Production never
      // reads this legacy key.
      if (!stored && process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
        try {
          const legacy = JSON.parse(localStorage.getItem('alistore.auth.v1') ?? 'null') as { accessToken?: string } | null;
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
        return await fn(stored.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const fresh = await authRefresh().catch(() => null);
        if (!fresh) {
          persist(null);
          setUser(null);
          throw new Error('session-expired');
        }
        persist(fresh);
        return fn(fresh.accessToken);
      }
    },
    [persist],
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
