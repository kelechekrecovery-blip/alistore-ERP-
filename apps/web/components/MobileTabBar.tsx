'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';

type Tab = 'home' | 'catalog' | 'cart' | 'account';

const TABS: { id: Tab; icon: string; label: string; href: string }[] = [
  { id: 'home', icon: '⌂', label: 'Главная', href: '/' },
  { id: 'catalog', icon: '▦', label: 'Каталог', href: '/' },
  { id: 'cart', icon: '🛒', label: 'Корзина', href: '/cart' },
  { id: 'account', icon: '👤', label: 'Кабинет', href: '/account' },
];

/** Dark mobile-app bottom navigation (Клиент App 2.0). */
export function MobileTabBar({ active }: { active: Tab }) {
  const { count, hydrated } = useCart();
  return (
    <div className="flex flex-shrink-0 border-t border-[#2E2822] bg-[#1A1611] px-1.5 pb-6 pt-2">
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} className="relative flex-1 text-center">
          <div className="text-xl">{t.icon}</div>
          {t.id === 'cart' && hydrated && count > 0 && (
            <span className="absolute right-1/2 top-0 translate-x-4 rounded-chip bg-coral px-1.5 text-[9px] font-bold text-white">
              {count}
            </span>
          )}
          <div className={`mt-0.5 text-[10px] ${active === t.id ? 'font-bold text-lime' : 'text-[#8A7F76]'}`}>
            {t.label}
          </div>
        </Link>
      ))}
    </div>
  );
}
