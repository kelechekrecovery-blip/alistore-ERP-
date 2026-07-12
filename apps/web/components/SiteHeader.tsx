'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, MapPin, Menu, Phone, Scale, Search, ShoppingBag, User, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import { ScrollProgress } from './storefront/Motion';

const MOBILE_NAV = [
  { href: '/', label: 'Магазин' },
  { href: '/catalog', label: 'Каталог' },
  { href: '/trade-in', label: 'Trade-in' },
  { href: '/support', label: 'Поддержка' },
  { href: '/b2b', label: 'Для бизнеса' },
];

const CATEGORY_NAV = [
  ['Смартфоны', '/catalog?category=Смартфоны'],
  ['Ноутбуки', '/catalog?category=Ноутбуки'],
  ['Планшеты', '/catalog?category=Планшеты'],
  ['Наушники', '/catalog?category=Аудио'],
  ['Часы', '/catalog?category=Часы'],
  ['Телевизоры', '/catalog?category=Телевизоры'],
  ['Аксессуары', '/catalog?category=Аксессуары'],
  ['Trade-in', '/trade-in'],
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const { count, hydrated: cartHydrated } = useCart();
  const { count: favoritesCount } = useFavorites();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white text-[#0f0f0f] shadow-[0_1px_0_#e5e5e7]">
      <div className="bg-[#0f0f0f] text-white">
        <div className="mx-auto flex h-8 max-w-[1400px] items-center justify-between px-5 text-xs">
          <div className="hidden items-center gap-6 text-white/80 md:flex">
            <Link href="/about" className="hover:text-white">О компании</Link>
            <Link href="/delivery" className="hover:text-white">Доставка и оплата</Link>
            <Link href="/support" className="hover:text-white">Гарантия и сервис</Link>
            <Link href="/b2b" className="hover:text-white">Для бизнеса</Link>
          </div>
          <div className="ml-auto flex items-center gap-5 text-white/80">
            <span className="hidden items-center gap-1.5 sm:flex"><MapPin size={13} /> Манас</span>
            <a href="tel:+996555123456" className="flex items-center gap-1.5 hover:text-white"><Phone size={13} /> +996 555 123 456</a>
            <span className="hidden lg:inline">Ежедневно 09:00–21:00</span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid h-[76px] max-w-[1400px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 md:h-[88px] md:grid-cols-[auto_auto_1fr_auto] md:gap-6 md:px-5">
        <Link href="/" className="flex shrink-0 items-baseline gap-1.5" aria-label="AliStore Electronics">
          <strong className="text-[22px] font-extrabold leading-none md:text-2xl">AliStore</strong>
          <span className="hidden text-[10px] uppercase tracking-[0.15em] text-[#8a8a8a] lg:inline">Electronics</span>
        </Link>

        <Link href="/catalog" className="hidden h-11 items-center gap-2.5 rounded-[10px] bg-[#ff4d2e] px-[18px] text-sm font-bold text-white transition-colors hover:bg-[#e63a1c] md:flex">
          <Menu size={17} /> Каталог
        </Link>

        <form action="/catalog" className="relative hidden h-11 min-w-0 md:block">
          <label htmlFor="header-search" className="sr-only">Поиск по каталогу</label>
          <input id="header-search" name="q" placeholder="Поиск по товарам" className="h-full w-full rounded-[10px] border border-[#e5e5e7] bg-[#f5f5f7] px-[18px] pr-14 text-sm outline-none transition focus:border-[#0f0f0f] focus:bg-white" />
          <button type="submit" aria-label="Найти" className="absolute bottom-1 right-1 top-1 grid w-10 place-items-center rounded-lg bg-[#0f0f0f] text-white"><Search size={17} /></button>
        </form>

        <div className="ml-auto flex items-center gap-0.5 md:gap-1">
          <HeaderTool href="/favorites" label="Избранное" icon={<Heart size={22} />} count={favoritesCount} hideLabel />
          <HeaderTool href="/compare" label="Сравнить" icon={<Scale size={22} />} hideLabel />
          <HeaderTool href={user ? '/account' : '/login'} label={user ? 'Профиль' : 'Войти'} icon={<User size={22} />} hideLabel />
          <HeaderTool href="/cart" label="Корзина" icon={<ShoppingBag size={22} />} count={cartHydrated ? count : 0} />
          <button type="button" onClick={() => setOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-lg text-[#4a4a4a] md:hidden" aria-label={open ? 'Закрыть меню' : 'Открыть меню'}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <nav className="hidden border-t border-[#e5e5e7] md:block" aria-label="Категории товаров">
        <div className="mx-auto flex max-w-[1400px] gap-6 overflow-x-auto px-5">
          {CATEGORY_NAV.map(([label, href], index) => (
            <Link key={label} href={href} className={`relative whitespace-nowrap py-3.5 text-[13px] font-medium text-[#4a4a4a] hover:text-[#0f0f0f] ${index === 0 && pathname === '/' ? 'font-bold text-[#0f0f0f] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#ff4d2e]' : ''}`}>{label}</Link>
          ))}
          <Link href="/catalog?promo=true" className="whitespace-nowrap py-3.5 text-[13px] font-semibold text-[#ff4d2e]">Акции</Link>
        </div>
      </nav>

      {open && (
        <nav className="border-t border-[#e5e5e7] bg-white px-4 py-3 md:hidden" aria-label="Мобильная навигация">
          {MOBILE_NAV.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block border-b border-[#e5e5e7] px-2 py-3 text-sm font-semibold last:border-0">{item.label}</Link>)}
        </nav>
      )}
      <ScrollProgress />
    </header>
  );
}

function HeaderTool({ href, label, icon, count = 0, hideLabel = false }: { href: string; label: string; icon: ReactNode; count?: number; hideLabel?: boolean }) {
  return (
    <Link href={href} aria-label={label} className="relative flex min-w-11 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[#4a4a4a] transition-colors hover:bg-[#f5f5f7] hover:text-[#0f0f0f] lg:min-w-[66px]">
      {icon}
      <span className={`${hideLabel ? 'hidden lg:block' : 'hidden sm:block'} text-[10px] font-medium`}>{label}</span>
      {count > 0 && <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#ff4d2e] px-1 text-[9px] font-bold text-white">{count}</span>}
    </Link>
  );
}
