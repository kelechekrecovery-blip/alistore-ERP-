'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import { ScrollProgress } from './storefront/Motion';

const NAV = [
  { href: '/', label: 'Магазин' },
  { href: '/catalog', label: 'Каталог' },
  { href: '/trade-in', label: 'Trade-in' },
  { href: '/support', label: 'Поддержка' },
  { href: '/b2b', label: 'Для бизнеса' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { count, hydrated: cartHydrated } = useCart();
  const { count: favoritesCount } = useFavorites();
  const { user, hydrated: authHydrated } = useAuth();
  const [open, setOpen] = useState(false);

  const active = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-[#E7DDD3] bg-[#F7F2EC]/90 text-ink backdrop-blur-xl">
      <nav className="mx-auto flex h-[74px] w-[min(1200px,92vw)] items-center gap-6" aria-label="Основная навигация">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="AliStore — магазин">
          <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-coral font-display text-lg font-extrabold text-white shadow-[0_10px_28px_-14px_rgba(232,65,15,.5)]">A</span>
          <span>
            <strong className="block font-display text-[18px] font-bold leading-none tracking-normal text-ink">ALISTORE</strong>
            <span className="mt-1 block text-[9px] uppercase tracking-[0.18em] text-[#8A7F76]">Электроника · Бишкек</span>
          </span>
        </Link>

        <div className="mx-auto hidden items-center gap-5 md:flex xl:gap-7">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={`relative py-2 text-sm transition-colors ${active(item.href) ? 'font-semibold text-ink' : 'text-[#6E645C] hover:text-deep'}`}>
              {item.label}
              {active(item.href) && <span className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-coral" />}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/catalog" aria-label="Поиск" title="Поиск" className="hidden h-10 w-10 place-items-center rounded-[11px] border border-[#DED3C8] bg-white text-[#6E645C] transition hover:border-coral hover:text-deep lg:grid">
            <Search size={18} />
          </Link>
          <Link href="/favorites" aria-label="Избранное" title="Избранное" className="relative hidden h-10 w-10 place-items-center rounded-[11px] border border-[#DED3C8] bg-white text-[#6E645C] transition hover:border-coral hover:text-deep lg:grid">
            <Heart size={18} />
            {favoritesCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">{favoritesCount}</span>}
          </Link>
          <Link href="/cart" aria-label="Корзина" title="Корзина" className="relative grid h-10 w-10 place-items-center rounded-[11px] border border-[#DED3C8] bg-white text-[#6E645C] transition hover:border-coral hover:text-deep">
            <ShoppingBag size={18} />
            {cartHydrated && count > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">{count}</span>}
          </Link>
          <Link href={user ? '/account' : '/login'} className="hidden items-center gap-2 rounded-[11px] bg-coral px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(232,65,15,.7)] transition hover:bg-deep sm:flex">
            <User size={16} />
            {authHydrated && user ? 'Кабинет' : 'Войти'}
          </Link>
          <button type="button" onClick={() => setOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-[11px] border border-[#DED3C8] bg-white text-ink md:hidden" aria-label={open ? 'Закрыть меню' : 'Открыть меню'}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-[#E7DDD3] bg-sand px-[4vw] py-4 md:hidden">
          <div className="mx-auto grid max-w-[1200px] gap-1">
            {NAV.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`rounded-[10px] px-3 py-3 text-sm ${active(item.href) ? 'bg-tint text-deep' : 'text-[#6E645C]'}`}>{item.label}</Link>)}
            <Link href={user ? '/account' : '/login'} onClick={() => setOpen(false)} className="mt-2 rounded-[10px] bg-coral px-3 py-3 text-center text-sm font-bold text-white">{user ? 'Кабинет' : 'Войти'}</Link>
          </div>
        </div>
      )}
      <ScrollProgress />
    </header>
  );
}
