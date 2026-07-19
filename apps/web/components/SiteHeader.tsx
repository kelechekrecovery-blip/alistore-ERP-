'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, MapPin, Menu, Phone, Scale, Search, ShoppingBag, User, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useCompare } from '@/lib/compare';
import { useFavorites } from '@/lib/favorites';
import { ScrollProgress } from './storefront/Motion';
import { fetchStorefrontContent, type StorefrontPayload } from '@/lib/api';

const MOBILE_NAV = [
  { href: '/', label: 'Магазин' },
  { href: '/catalog', label: 'Каталог' },
  // Favorites/Compare are hidden from the header icon row below 390px; keep them
  // reachable here so narrow phones don't lose access to those features.
  { href: '/favorites', label: 'Избранное' },
  { href: '/compare', label: 'Сравнить' },
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

export function SiteHeader({ variant = 'design3' }: { variant?: 'light' | 'design3' }) {
  const design3 = variant === 'design3';
  const pathname = usePathname();
  const { count, hydrated: cartHydrated } = useCart();
  const { count: favoritesCount } = useFavorites();
  const { count: compareCount } = useCompare();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [storefront, setStorefront] = useState<StorefrontPayload | null>(null);
  useEffect(() => { fetchStorefrontContent().then(setStorefront); }, []);
  const point = storefront?.stores[0];

  return (
    <header className={design3 ? 'sticky top-0 z-50 border-b border-white/10 bg-[#120e0a]/90 text-white shadow-[0_18px_50px_rgba(0,0,0,.32)] backdrop-blur-xl' : 'sticky top-0 z-50 bg-white text-ink shadow-[0_1px_0_#e5e5e7]'}>
      <div className={design3 ? 'border-b border-white/[.06] bg-black/20 text-white' : 'bg-ink-dark text-white'}>
        <div className="mx-auto flex h-8 max-w-[1400px] items-center justify-between px-5 text-xs">
          <div className="hidden items-center gap-6 text-white/70 md:flex">
            <Link href="/about" className="hover:text-white">О компании</Link>
            <Link href="/delivery" className="hover:text-white">Доставка и оплата</Link>
            <Link href="/support" className="hover:text-white">Гарантия и сервис</Link>
            <Link href="/b2b" className="hover:text-white">Для бизнеса</Link>
          </div>
          <div className="ml-auto flex items-center gap-5 text-white/70">
            {point && <span className="hidden items-center gap-1.5 sm:flex"><MapPin size={13} /> {point.name}</span>}
            {storefront?.content.contactPhone && <a href={`tel:${storefront.content.contactPhone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 hover:text-white"><Phone size={13} /> {storefront.content.contactPhone}</a>}
            {storefront?.content.supportHours && <span className="hidden lg:inline">{storefront.content.supportHours}</span>}
          </div>
        </div>
      </div>

      <div className="mx-auto grid h-[76px] max-w-[1400px] grid-cols-[auto_1fr_auto] items-center gap-3 px-3 md:h-[82px] md:grid-cols-[auto_auto_1fr_auto] md:gap-6 md:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="AliStore Electronics">
          {design3 && <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-[#ff7a4d] to-[#e8410f] text-sm font-extrabold text-white shadow-[0_5px_14px_rgba(255,91,46,.35)]">A</span>}
          <strong className="font-display text-[22px] font-extrabold leading-none md:text-2xl">AliStore</strong>
          <span className={`${design3 ? 'text-white/40' : 'text-faint'} hidden text-[10px] uppercase tracking-[0.15em] lg:inline`}>Electronics</span>
        </Link>

        <Link href="/catalog" className={`hidden h-11 items-center gap-2.5 rounded-[10px] px-[18px] text-sm font-bold text-white transition md:flex ${design3 ? 'erp3-coral-action hover:brightness-110' : 'bg-coral hover:bg-deep'}`}>
          <Menu size={17} /> Каталог
        </Link>

        <form action="/catalog" className="relative hidden h-11 min-w-0 md:block">
          <label htmlFor="header-search" className="sr-only">Поиск по каталогу</label>
          <input id="header-search" name="q" placeholder="Поиск техники…" className={`h-full w-full rounded-[10px] px-[18px] pr-14 text-sm outline-none transition focus:border-coral ${design3 ? 'border border-white/10 bg-white/[.06] text-white placeholder:text-white/35 focus:bg-white/[.1]' : 'border border-linen bg-sand text-ink focus:border-coal focus:bg-white'}`} />
          <button type="submit" aria-label="Найти" className={`absolute bottom-1 right-1 top-1 grid w-11 place-items-center rounded-lg text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40 ${design3 ? 'bg-white/10 hover:bg-white/20' : 'bg-ink-dark hover:bg-ink'}`}><Search size={17} /></button>
        </form>

        <div className="ml-auto flex items-center gap-0.5 md:gap-1">
          <HeaderTool dark={design3} href="/favorites" label="Избранное" icon={<Heart size={22} />} count={favoritesCount} hideLabel className="max-[389px]:hidden" />
          <HeaderTool dark={design3} href="/compare" label="Сравнить" icon={<Scale size={22} />} count={compareCount} hideLabel className="max-[389px]:hidden" />
          <HeaderTool dark={design3} href={user ? '/account' : '/login'} label={user ? 'Профиль' : 'Войти'} icon={<User size={22} />} hideLabel />
          <HeaderTool dark={design3} href="/cart" label="Корзина" icon={<ShoppingBag size={22} />} count={cartHydrated ? count : 0} />
          <button type="button" onClick={() => setOpen((value) => !value)} className={`grid h-11 w-11 place-items-center rounded-lg md:hidden ${design3 ? 'text-white/70 hover:bg-white/[.08] hover:text-white' : 'text-faint hover:bg-sand'}`} aria-label={open ? 'Закрыть меню' : 'Открыть меню'}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <nav className={`hidden border-t md:block ${design3 ? 'border-white/[.07]' : 'border-linen'}`} aria-label="Категории товаров">
        <div className="mx-auto flex max-w-[1400px] gap-6 overflow-x-auto px-5">
          {CATEGORY_NAV.map(([label, href], index) => (
            <Link key={label} href={href} className={`relative whitespace-nowrap py-3.5 text-[13px] font-medium ${design3 ? 'text-white/60 hover:text-white' : 'text-faint hover:text-ink'} ${index === 0 && pathname === '/' ? `font-bold ${design3 ? 'text-white' : 'text-ink'} after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-coral` : ''}`}>{label}</Link>
          ))}
          <Link href="/catalog?promo=true" className="whitespace-nowrap py-3.5 text-[13px] font-semibold text-[#ff9a6e]">Акции</Link>
        </div>
      </nav>

      {open && (
        <nav className={`border-t px-4 py-3 md:hidden ${design3 ? 'border-white/[.08] bg-[#181410] text-white' : 'border-linen bg-white'}`} aria-label="Мобильная навигация">
          {MOBILE_NAV.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`block border-b px-2 py-3 text-sm font-semibold last:border-0 ${design3 ? 'border-white/[.08] text-white/75 hover:text-white' : 'border-linen'}`}>{item.label}</Link>)}
        </nav>
      )}
      <ScrollProgress />
    </header>
  );
}

function HeaderTool({ href, label, icon, count = 0, hideLabel = false, dark = false, className = '' }: { href: string; label: string; icon: ReactNode; count?: number; hideLabel?: boolean; dark?: boolean; className?: string }) {
  return (
    <Link href={href} aria-label={label} className={`relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40 lg:min-w-[66px] ${dark ? 'text-white/70 hover:bg-white/[.08] hover:text-white' : 'text-faint hover:bg-sand hover:text-ink'} ${className}`}>
      {icon}
      <span className={`${hideLabel ? 'hidden lg:block' : 'hidden sm:block'} text-[10px] font-medium`}>{label}</span>
      {count > 0 && <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[9px] font-bold text-white">{count}</span>}
    </Link>
  );
}
