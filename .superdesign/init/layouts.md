# Shared layouts

These are the actual cross-page shells used by the web storefront and the client/service surfaces. POS, Staff, and Courier route screens currently own their route-specific shells inline; the files below are the reusable layout layer they share with the wider ecosystem.

## `apps/web/app/layout.tsx`

Root application document, metadata, fonts, global providers, reduced-motion policy, and demo/attribution overlays.

```tsx
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { fontDisplay, fontSans, fontMono } from './fonts';
import { CartProvider } from '@/lib/cart';
import { LocaleProvider } from '@/lib/i18n/locale';
import { AuthProvider } from '@/lib/auth';
import { FavoritesProvider } from '@/lib/favorites';
import { CompareProvider } from '@/lib/compare';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { AttributionCapture } from '@/components/AttributionCapture';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  // Resolves relative openGraph/twitter image URLs (e.g. product photos stored as
  // root-relative `/uploads/...` paths) against the public origin instead of Next's
  // "http://localhost:3000" fallback, which would break link previews in production.
  metadataBase: new URL(SITE_URL),
  title: 'AliStore — электроника с гарантией в Кыргызстане',
  description:
    'Новое и Б/У привозное с гарантией. Смартфоны, ноутбуки, аудио, часы — с проверкой по IMEI и честной ценой.',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        {/*
          Шрифты первого экрана. Браузер находит @font-face только разобрав CSS,
          то есть узнаёт о них позже, чем мог бы; preload убирает эту задержку.
          Здесь ровно два файла основного семейства — кириллица и латиница
          Golos Text: остальные начертания нарезаны по unicode-range и грузятся
          сами, только если такие символы реально встретились на странице.
        */}
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/cfdfbee4d6cf0a93-s.p.1jwcpm6w583_v.woff2" />
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/b4a06a523f527a0e-s.p.3psl0_mnhzy2y.woff2" />
      </head>
      <body className="min-h-screen bg-night">
        <AttributionCapture />
        <LocaleProvider>
          <AuthProvider>
            <CartProvider>
              <FavoritesProvider>
                <CompareProvider>
                  <MotionConfig reducedMotion="user">{children}</MotionConfig>
                  <DemoModeBanner />
                </CompareProvider>
              </FavoritesProvider>
            </CartProvider>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
```
## `apps/web/components/SiteHeader.tsx`

Reusable responsive storefront header: utility strip, catalog/search actions, account/cart tools, category nav, and mobile menu.

```tsx
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
          <span className={`${design3 ? 'text-white/60' : 'text-faint'} hidden text-[10px] uppercase tracking-[0.15em] lg:inline`}>Electronics</span>
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
```
## `apps/web/components/SiteFooter.tsx`

Reusable storefront footer with dynamic contact/store content and customer, account, and legal links.

```tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchStorefrontContent, type StorefrontPayload } from '@/lib/api';

export function SiteFooter() {
  const [storefront, setStorefront] = useState<StorefrontPayload | null>(null);
  useEffect(() => { fetchStorefrontContent().then(setStorefront); }, []);
  const point = storefront?.stores[0];
  return (
    <footer className="mt-24 border-t border-surface-3 bg-ink-dark">
      <div className="mx-auto grid w-[min(1200px,92vw)] gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-coral font-display font-bold text-white">A</span>
            <strong className="font-display text-lg text-white">ALISTORE</strong>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted">{storefront?.content.aboutBody ?? 'Каталог, заказ, получение и сервис AliStore.'}</p>
        </div>
        {/* «Гарантия» ведёт в кабинет устройств покупателя, а не на /warranty:
            тот маршрут — рабочее место сервисной службы за логином сотрудника. */}
        <FooterColumn title="Покупателям" links={[["Каталог", "/catalog"], ["Trade-in", "/trade-in"], ["Гарантия", "/account/devices"], ["Поддержка", "/support"]]} />
        <FooterColumn title="Аккаунт" links={[["Кабинет", "/account"], ["Заказы", "/account"], ["Избранное", "/favorites"], ["Бонусы", "/account/bonuses"]]} />
        <FooterColumn title="Документы" links={[["Политика конфиденциальности", "/privacy"], ["Публичная оферта", "/oferta"]]} />
        <div>
          <h3 className="text-sm font-semibold text-white">Контакты</h3>
          {point && <><p className="mt-4 text-sm text-bright">{point.address}</p><p className="mt-2 text-sm text-bright">{point.hours}</p></>}
          {storefront?.content.contactPhone && <a href={`tel:${storefront.content.contactPhone.replace(/\s/g, '')}`} className="mt-2 block text-sm text-bright">{storefront.content.contactPhone}</a>}
          <Link href="/support" className="mt-4 inline-block text-sm text-coral-light">Написать в поддержку</Link>
        </div>
      </div>
      <div className="border-t border-surface-3 py-5 text-center text-xs text-subtle">© 2026 AliStore · Электроника · Кыргызстан</div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return <div><h3 className="text-sm font-semibold text-white">{title}</h3><div className="mt-4 grid gap-2.5">{links.map(([label, href]) => <Link key={href + label} href={href} className="text-sm text-bright transition hover:text-coral-light">{label}</Link>)}</div></div>;
}
```

## `apps/web/components/MobileAppFrame.tsx`

Reusable service/detail-page shell combining SiteHeader, titled back navigation, content surface, and SiteFooter.

```tsx
'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

type ActiveTab = 'home' | 'catalog' | 'cart' | 'account';

export function MobileAppFrame({
  title,
  subtitle,
  children,
  backHref,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  active?: ActiveTab;
  backHref?: string;
}) {
  const router = useRouter();

  return (
    <div className="customer-service-shell min-h-screen bg-ink-dark font-sans text-white">
      <SiteHeader variant="design3" />
      <main className="customer-service-main mx-auto w-[min(980px,92vw)] py-10 sm:py-14">
        <div className="mb-7 flex items-start gap-4">
          {backHref ? (
            <Link href={backHref} className="customer-service-back grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-white/[0.1] bg-white/[0.035] text-muted hover:text-white" aria-label="Назад">
              <ArrowLeft size={18} />
            </Link>
          ) : (
            <button type="button" onClick={() => router.back()} className="customer-service-back grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-white/[0.1] bg-white/[0.035] text-muted hover:text-white" aria-label="Назад">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="customer-service-title font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
            {subtitle && <p className="customer-service-subtitle mt-2 max-w-[65ch] text-sm leading-6 text-muted sm:text-base">{subtitle}</p>}
          </div>
        </div>
        <div className="customer-service-content rounded-[22px] border border-white/[0.1] bg-white/[0.035] p-5 sm:p-7">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
```

## `apps/web/components/mobile/MobileFrame.tsx`

Shared storefront mobile phone-column shell with city/search header and persistent bottom navigation.

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeftRight, Bell, ChevronDown, MapPin, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { MobileTabBar, type Tab } from '@/components/MobileTabBar';
import { loginHref } from '@/components/mobile/login-next';
import { useAuth } from '@/lib/auth';
import { useCompare } from '@/lib/compare';

interface MobileFrameProps {
  active: Tab;
  children: ReactNode;
  /** Show the city + compare/notif + search header (Клиент App 2.0). Default true. */
  header?: boolean;
  city?: string;
}

/**
 * Shared dark mobile-app shell for the storefront (Клиент App 2.0): a centered
 * warm-black phone column with the city/compare/notify header + search pill on top and
 * the persistent 5-tab bottom nav. Screens render their content as children.
 */
export function MobileFrame({ active, children, header = true, city = 'Бишкек' }: MobileFrameProps) {
  const { count: compareCount } = useCompare();
  const { user, hydrated } = useAuth();
  const pathname = usePathname();
  // Кнопку показываем только после гидратации: до неё `user` всегда null,
  // и её появление-исчезание на подтверждённой сессии выглядело бы миганием.
  const showLogin = hydrated && !user;
  return (
    <div className="flex min-h-screen justify-center overflow-x-clip bg-night font-sans text-white">
      <div className="flex min-h-screen w-full max-w-[440px] flex-col bg-ink-dark">
        {header && (
          <header className="sticky top-0 z-20 flex-shrink-0 bg-ink-dark/95 px-4 pb-3 pt-3 backdrop-blur">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-muted">
                <MapPin size={13} aria-hidden />
                {city}
                <ChevronDown size={13} aria-hidden />
              </span>
              <div className="ml-auto flex items-center gap-1">
                {showLogin && (
                  <Link
                    href={loginHref(pathname)}
                    className="tap-target"
                  >
                    {/* Зона нажатия растёт до 44 на самой ссылке, а пилюля
                        остаётся прежней: если залить фоном всю зону, кнопка
                        превращается в лаймовый овал во всю высоту шапки. */}
                    <span className="rounded-full border border-lime/40 bg-lime/10 px-2.5 py-1 text-[11px] font-bold text-lime">
                      Войти
                    </span>
                  </Link>
                )}
                <Link href="/compare" className="tap-target relative" aria-label="Сравнение">
                  <ArrowLeftRight size={18} aria-hidden />
                  {compareCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-lime px-1 text-[9px] font-bold text-lime-ink">
                      {compareCount}
                    </span>
                  )}
                </Link>
                <Link href="/account/notifications" className="tap-target relative" aria-label="Уведомления">
                  <Bell size={18} aria-hidden />
                  <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-coral" />
                </Link>
              </div>
            </div>
            <Link
              href="/search"
              className="flex min-h-[44px] items-center gap-2.5 rounded-[13px] border border-surface-3 bg-surface-2 px-3.5 py-2.5"
            >
              <Search size={16} className="text-faint" aria-hidden />
              <span className="text-sm text-faint">Поиск техники, брендов…</span>
            </Link>
          </header>
        )}

        <main className="flex-1">{children}</main>

        <div className="sticky bottom-0 z-20">
          <MobileTabBar active={active} />
        </div>
      </div>
    </div>
  );
}
```

## `apps/web/components/MobileTabBar.tsx`

Persistent five-tab client navigation with live favorites and cart badges.

```tsx
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
```
