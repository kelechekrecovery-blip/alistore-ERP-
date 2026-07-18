'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';

export type Tab = 'home' | 'catalog' | 'favorites' | 'cart' | 'account';

const TABS: { id: Tab; icon: string; label: string; href: string }[] = [
  { id: 'home', icon: '⌂', label: 'Главная', href: '/' },
  { id: 'catalog', icon: '▦', label: 'Каталог', href: '/catalog' },
  { id: 'favorites', icon: '♡', label: 'Избранное', href: '/favorites' },
  { id: 'cart', icon: '🛒', label: 'Корзина', href: '/cart' },
  { id: 'account', icon: '👤', label: 'Кабинет', href: '/account' },
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
          <Link key={t.id} href={t.href} className="relative flex-1 text-center">
            <div className="text-xl leading-none">{t.icon}</div>
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
