'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const COMPARE_MAX = 4;

interface CompareValue {
  ids: string[];
  count: number;
  hydrated: boolean;
  full: boolean;
  has: (id: string) => boolean;
  /** Toggle membership; returns false if the add was rejected (list already full). */
  toggle: (id: string) => boolean;
  remove: (id: string) => void;
  clear: () => void;
}

const CompareContext = createContext<CompareValue | null>(null);
const STORAGE_KEY = 'alistore.compare.v1';

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setIds((JSON.parse(raw) as string[]).slice(0, COMPARE_MAX));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }, [ids, hydrated]);

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => {
    let accepted = true;
    setIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= COMPARE_MAX) {
        accepted = false;
        return prev;
      }
      return [...prev, id];
    });
    return accepted;
  }, []);
  const remove = useCallback((id: string) => setIds((prev) => prev.filter((x) => x !== id)), []);
  const clear = useCallback(() => setIds([]), []);

  const value = useMemo<CompareValue>(
    () => ({ ids, count: ids.length, hydrated, full: ids.length >= COMPARE_MAX, has, toggle, remove, clear }),
    [ids, hydrated, has, toggle, remove, clear],
  );
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used within CompareProvider');
  return ctx;
}
