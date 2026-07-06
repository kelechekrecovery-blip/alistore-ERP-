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
  authRequestOtp,
  authVerifyOtp,
  type AuthTokens,
  type AuthUser,
} from './api';

interface AuthContextValue {
  user: AuthUser | null;
  hydrated: boolean;
  requestOtp: (phone: string) => Promise<{ devCode?: string }>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Run an authed request with the access token, refreshing once on failure. */
  authed: <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'alistore.auth.v1';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

function load(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const tokens = useRef<StoredTokens | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const persist = useCallback((t: AuthTokens | null) => {
    if (t) {
      tokens.current = { accessToken: t.accessToken, refreshToken: t.refreshToken };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens.current));
    } else {
      tokens.current = null;
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // restore session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = load();
      tokens.current = stored;
      if (stored) {
        try {
          const me = await authMe(stored.accessToken);
          if (!cancelled) setUser(me);
        } catch {
          // access expired → try one refresh
          try {
            const fresh = await authRefresh(stored.refreshToken);
            persist(fresh);
            const me = await authMe(fresh.accessToken);
            if (!cancelled) setUser(me);
          } catch {
            persist(null);
          }
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

  const logout = useCallback(async () => {
    const stored = tokens.current;
    if (stored) await authLogout(stored.refreshToken);
    persist(null);
    setUser(null);
  }, [persist]);

  const authed = useCallback(
    async <T,>(fn: (accessToken: string) => Promise<T>): Promise<T> => {
      const stored = tokens.current;
      if (!stored) throw new Error('not-authenticated');
      try {
        return await fn(stored.accessToken);
      } catch {
        const fresh = await authRefresh(stored.refreshToken).catch(() => null);
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
    () => ({ user, hydrated, requestOtp, verifyOtp, logout, authed }),
    [user, hydrated, requestOtp, verifyOtp, logout, authed],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
