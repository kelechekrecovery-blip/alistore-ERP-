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
import { quotePromotion } from './api/promotions';

export interface CartItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  qty: number;
  stockLimit: number;
  /** `to_order` lines skip the stock gate server-side — see SUPPLY-TO-ORDER-PLAN.md срез 2. */
  supplyMode: 'own_stock' | 'to_order';
  supplyLeadDays: number | null;
  /** Refreshed storefront purchase permission; omitted by legacy stored carts. */
  orderable?: boolean;
}

/**
 * A to-order line has no stock ceiling — nothing physical to run out of before
 * it is even ordered from the supplier — so `stockLimit` can't come from
 * `availableUnits` (always 0) the way it does for own-stock items. The cap
 * below is not a stock guard; it is a sanity ceiling against a fat-fingered or
 * runaway single-request quantity. Ten units is generous for a walk-in request
 * (e.g. a handful of accessories for a small team); a genuinely larger order
 * goes through staff, not the storefront `+` button.
 */
export const TO_ORDER_CART_QTY_CAP = 10;

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  total: number;
  promoCode: string | null;
  promoDiscount: number;
  promoLoading: boolean;
  promoError: string | null;
  bonusApplied: boolean;
  bonusBalance: number;
  bonusLoading: boolean;
  bonusError: string | null;
  bonusDiscount: number;
  discount: number;
  hydrated: boolean;
  /** Supply mode of what is currently in the cart, or `null` when empty. */
  cartSupplyMode: 'own_stock' | 'to_order' | null;
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  applyPromo: (code: string) => Promise<boolean>;
  clearPromo: () => void;
  toggleBonus: () => void;
  clear: () => void;
  reconcileAvailability: (products: Array<{
    id: string;
    price: number;
    availableUnits: number;
    supplyMode?: 'own_stock' | 'to_order';
    supplyLeadDays?: number | null;
    orderable?: boolean;
  }>) => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'alistore.cart.v1';
const PRICING_KEY = 'alistore.cart.pricing.v1';
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, hydrated: authHydrated, authed } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [bonusApplied, setBonusApplied] = useState(false);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // load once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<Partial<CartItem>>;
        // Tolerant migration, no STORAGE_KEY version bump: a cart saved before
        // supply-mode carts shipped has no `supplyMode`/`supplyLeadDays` at
        // all. Every such cart was, by construction, own-stock — defaulting a
        // missing field to 'own_stock' reproduces exactly the old behaviour
        // instead of crashing the page or inventing a to-order line no one
        // asked for.
        setItems(parsed.filter((item) => item.id && item.sku && item.name && Number.isFinite(item.price) && Number.isFinite(item.qty)).map((item) => {
          const supplyMode: CartItem['supplyMode'] = item.supplyMode === 'to_order' ? 'to_order' : 'own_stock';
          const stockLimit = Math.max(0, Number.isFinite(item.stockLimit) ? item.stockLimit! : item.qty!);
          return {
            id: item.id!, sku: item.sku!, name: item.name!, price: item.price!,
            stockLimit,
            supplyMode,
            supplyLeadDays: supplyMode === 'to_order' && Number.isFinite(item.supplyLeadDays) ? item.supplyLeadDays! : null,
            orderable: item.orderable,
            qty: Math.max(1, Math.min(item.qty!, stockLimit)),
          };
        }));
      }
      // fixtures-allowed: корзина — клиентское состояние; при испорченном JSON восстанавливать её неоткуда, пустая корзина здесь и есть правда, а не подменённые данные
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
      // fixtures-allowed: промокод и бонусы всё равно пересчитываются сервером при оформлении — испорченный локальный кэш просто не применяется
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
      // fixtures-allowed: не сохранили корзину (квота/приватный режим) — она продолжает работать в памяти текущей сессии
    } catch {
      /* ignore quota errors */
    }
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PRICING_KEY, JSON.stringify({ promoCode, bonusApplied }));
      // fixtures-allowed: не сохранили промокод/бонусы локально — сервер всё равно пересчитает их при оформлении
    } catch {
      /* ignore quota errors */
    }
  }, [promoCode, bonusApplied, hydrated]);

  const add = useCallback((item: Omit<CartItem, 'qty'>, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((x) => x.id === item.id);
      if (existing) {
        return prev.map((x) => (x.id === item.id ? { ...x, ...item, qty: Math.min(x.qty + qty, item.stockLimit) } : x));
      }
      // Mixed carts are intentional: the server creates separate receivables
      // for stock, deposit and supply balance.
      return item.stockLimit > 0 ? [...prev, { ...item, qty: Math.min(qty, item.stockLimit) }] : prev;
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((x) => x.id !== id)
        : prev.map((x) => (x.id === id ? { ...x, qty: Math.min(qty, x.stockLimit) } : x)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const requestPromoQuote = useCallback(async (code: string) => {
    const input = items.map((item) => ({ sku: item.sku, qty: item.qty }));
    if (input.length === 0) throw new Error('Добавьте товар перед применением промокода');
    return user
      ? authed((token) => quotePromotion(code, input, token))
      : quotePromotion(code, input);
  }, [items, user, authed]);

  const applyPromo = useCallback(async (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return false;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const quote = await requestPromoQuote(normalized);
      setPromoCode(quote.code);
      setPromoDiscount(quote.discount);
      return true;
    } catch (error) {
      setPromoCode(null);
      setPromoDiscount(0);
      setPromoError(error instanceof Error ? error.message : 'Промокод недоступен');
      return false;
    } finally {
      setPromoLoading(false);
    }
  }, [requestPromoQuote]);

  const clearPromo = useCallback(() => {
    setPromoCode(null);
    setPromoDiscount(0);
    setPromoError(null);
  }, []);

  useEffect(() => {
    if (!hydrated || !promoCode) return;
    let active = true;
    setPromoLoading(true);
    requestPromoQuote(promoCode)
      .then((quote) => {
        if (!active) return;
        setPromoDiscount(quote.discount);
        setPromoError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPromoCode(null);
        setPromoDiscount(0);
        setPromoError(error instanceof Error ? error.message : 'Промокод больше не действует');
      })
      .finally(() => { if (active) setPromoLoading(false); });
    return () => { active = false; };
  }, [hydrated, promoCode, requestPromoQuote]);
  const toggleBonus = useCallback(() => {
    if (bonusBalance > 0) setBonusApplied((value) => !value);
  }, [bonusBalance]);

  const clear = useCallback(() => {
    setItems([]);
    setPromoCode(null);
    setPromoDiscount(0);
    setPromoError(null);
    setBonusApplied(false);
  }, []);

  const reconcileAvailability = useCallback((products: Array<{
    id: string;
    price: number;
    availableUnits: number;
    supplyMode?: 'own_stock' | 'to_order';
    supplyLeadDays?: number | null;
    orderable?: boolean;
  }>) => {
    const byId = new Map(products.map((product) => [product.id, product]));
    setItems((current) => current.flatMap((item) => {
      const product = byId.get(item.id);
      if (!product) return [];
      const isToOrder = product.supplyMode === 'to_order';
      // A to-order line has `availableUnits === 0` by definition — it must
      // survive this reconcile even though an own-stock line at 0 must not
      // (over-selling our own stock stays impossible; that clamp is
      // unchanged below).
      if (!isToOrder && product.availableUnits <= 0) return [];
      const stockLimit = isToOrder ? TO_ORDER_CART_QTY_CAP : product.availableUnits;
      return [{
        ...item,
        price: product.price,
        stockLimit,
        supplyMode: isToOrder ? 'to_order' : 'own_stock',
        supplyLeadDays: isToOrder ? (product.supplyLeadDays ?? null) : null,
        orderable: product.orderable,
        qty: Math.min(item.qty, stockLimit),
      }];
    }));
  }, []);

  /** First line mode for legacy presentation code; mixed carts are allowed. */
  const cartSupplyMode = useMemo<'own_stock' | 'to_order' | null>(
    () => items[0]?.supplyMode ?? null,
    [items],
  );

  const count = useMemo(() => items.reduce((s, x) => s + x.qty, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((s, x) => s + x.price * x.qty, 0),
    [items],
  );
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
      promoLoading,
      promoError,
      bonusApplied,
      bonusBalance,
      bonusLoading,
      bonusError,
      bonusDiscount,
      discount,
      hydrated,
      cartSupplyMode,
      add,
      setQty,
      remove,
      applyPromo,
      clearPromo,
      toggleBonus,
      clear,
      reconcileAvailability,
    }),
    [
      items,
      count,
      subtotal,
      total,
      promoCode,
      promoDiscount,
      promoLoading,
      promoError,
      bonusApplied,
      bonusBalance,
      bonusLoading,
      bonusError,
      bonusDiscount,
      discount,
      hydrated,
      cartSupplyMode,
      add,
      setQty,
      remove,
      applyPromo,
      clearPromo,
      toggleBonus,
      clear,
      reconcileAvailability,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
