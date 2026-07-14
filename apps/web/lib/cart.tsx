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
import { useAuth } from './auth';
import { fetchMyLoyalty } from './api';

export interface CartItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  total: number;
  promoCode: string | null;
  promoDiscount: number;
  bonusApplied: boolean;
  bonusBalance: number;
  bonusLoading: boolean;
  bonusError: string | null;
  bonusDiscount: number;
  discount: number;
  hydrated: boolean;
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  applyPromo: (code: string) => boolean;
  clearPromo: () => void;
  toggleBonus: () => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'alistore.cart.v1';
const PRICING_KEY = 'alistore.cart.pricing.v1';
const PROMOS: Record<string, number> = {
  SALE5000: 5000,
  ALI10: 3000,
};

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, hydrated: authHydrated, authed } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [bonusApplied, setBonusApplied] = useState(false);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // load once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      /* ignore corrupt storage */
    }
    try {
      const raw = localStorage.getItem(PRICING_KEY);
      if (raw) {
        const pricing = JSON.parse(raw) as { promoCode?: string | null; bonusApplied?: boolean };
        setPromoCode(pricing.promoCode ? pricing.promoCode : null);
        setBonusApplied(Boolean(pricing.bonusApplied));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!authHydrated) return;
    if (!user) {
      setBonusBalance(0);
      setBonusApplied(false);
      setBonusError(null);
      return;
    }
    let cancelled = false;
    setBonusLoading(true);
    setBonusError(null);
    authed(fetchMyLoyalty)
      .then((loyalty) => { if (!cancelled) setBonusBalance(loyalty.balance); })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBonusBalance(0);
          setBonusApplied(false);
          setBonusError(error instanceof Error ? error.message : 'Не удалось загрузить бонусы');
        }
      })
      .finally(() => { if (!cancelled) setBonusLoading(false); });
    return () => { cancelled = true; };
  }, [authHydrated, user, authed]);

  // persist on change (immutable updates only)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota errors */
    }
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PRICING_KEY, JSON.stringify({ promoCode, bonusApplied }));
    } catch {
      /* ignore quota errors */
    }
  }, [promoCode, bonusApplied, hydrated]);

  const add = useCallback((item: Omit<CartItem, 'qty'>, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((x) => x.id === item.id);
      if (existing) {
        return prev.map((x) => (x.id === item.id ? { ...x, qty: x.qty + qty } : x));
      }
      return [...prev, { ...item, qty }];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((x) => x.id !== id)
        : prev.map((x) => (x.id === id ? { ...x, qty } : x)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const applyPromo = useCallback((code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!PROMOS[normalized]) return false;
    setPromoCode(normalized);
    return true;
  }, []);

  const clearPromo = useCallback(() => setPromoCode(null), []);
  const toggleBonus = useCallback(() => {
    if (bonusBalance > 0) setBonusApplied((value) => !value);
  }, [bonusBalance]);

  const clear = useCallback(() => {
    setItems([]);
    setPromoCode(null);
    setBonusApplied(false);
  }, []);

  const count = useMemo(() => items.reduce((s, x) => s + x.qty, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((s, x) => s + x.price * x.qty, 0),
    [items],
  );
  const promoDiscount = promoCode ? Math.min(subtotal, PROMOS[promoCode] ?? 0) : 0;
  const bonusDiscount = bonusApplied ? Math.min(Math.max(subtotal - promoDiscount, 0), bonusBalance) : 0;
  const discount = promoDiscount + bonusDiscount;
  const total = Math.max(subtotal - discount, 0);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count,
      subtotal,
      total,
      promoCode,
      promoDiscount,
      bonusApplied,
      bonusBalance,
      bonusLoading,
      bonusError,
      bonusDiscount,
      discount,
      hydrated,
      add,
      setQty,
      remove,
      applyPromo,
      clearPromo,
      toggleBonus,
      clear,
    }),
    [
      items,
      count,
      subtotal,
      total,
      promoCode,
      promoDiscount,
      bonusApplied,
      bonusBalance,
      bonusLoading,
      bonusError,
      bonusDiscount,
      discount,
      hydrated,
      add,
      setQty,
      remove,
      applyPromo,
      clearPromo,
      toggleBonus,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
