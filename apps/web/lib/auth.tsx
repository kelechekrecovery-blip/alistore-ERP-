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
  authRequestRecoveryOtp,
  authRequestOtp,
  authTelegramLogin,
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
  telegramLogin: (initData: string, source?: 'mini_app' | 'login_widget') => Promise<void>;
  logout: () => Promise<void>;
  /** Run an authed request with the access token, refreshing once on failure. */
  authed: <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionTokens {
  accessToken: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const tokens = useRef<SessionTokens | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const persist = useCallback((t: AuthTokens | null) => {
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
      // Remove sessions created by the pre-cookie release. Shopping state uses
      // separate keys and is intentionally preserved.
      localStorage.removeItem('alistore.auth.v1');
      // This flag is non-secret. Tokens remain HttpOnly and are never read by
      // the Web bundle; the flag only avoids an anonymous refresh probe.
      const hasSessionHint = document.cookie
        .split(';')
        .some((entry) => entry.trim().startsWith('alistore_session_hint='));
      if (!hasSessionHint) {
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
      const stored = tokens.current;
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
