'use client';

import Link from 'next/link';
import { Heart, Home, LayoutGrid, ShoppingCart, User, type LucideIcon } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';

export type Tab = 'home' | 'catalog' | 'favorites' | 'cart' | 'account';

const TABS: { id: Tab; Icon: LucideIcon; label: string; href: string }[] = [
  { id: 'home', Icon: Home, label: 'Главная', href: '/' },
  { id: 'catalog', Icon: LayoutGrid, label: 'Каталог', href: '/catalog' },
  { id: 'favorites', Icon: Heart, label: 'Избранное', href: '/favorites' },
  { id: 'cart', Icon: ShoppingCart, label: 'Корзина', href: '/cart' },
  { id: 'account', Icon: User, label: 'Кабинет', href: '/account' },
];

/** Dark mobile-app bottom navigation (Клиент App 2.0) — persistent 5-tab bar. */
export function MobileTabBar({ active }: { active: Tab }) {
  const { count, hydrated } = useCart();
  const { count: favCount } = useFavorites();
  return (
    <div className="flex flex-shrink-0 border-t border-surface-3 bg-surface px-1.5 pb-6 pt-2">
      {TABS.map((t) => {
        const badge = t.id === 'cart' ? (hydrated ? count : 0) : t.id === 'favorites' ? favCount : 0;
        return (
          <Link key={t.id} href={t.href} className="relative flex min-h-[44px] flex-1 flex-col items-center justify-center text-center">
            <t.Icon
              size={22}
              strokeWidth={active === t.id ? 2.4 : 1.8}
              aria-hidden
              className={`mx-auto ${active === t.id ? 'text-lime' : 'text-subtle'}`}
            />
            {badge > 0 && (
              <span className="absolute right-1/2 top-0 translate-x-4 rounded-chip bg-coral px-1.5 text-[9px] font-bold text-white">
                {badge}
              </span>
            )}
            <div className={`mt-1 text-[10px] ${active === t.id ? 'font-bold text-lime' : 'text-subtle'}`}>
              {t.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
