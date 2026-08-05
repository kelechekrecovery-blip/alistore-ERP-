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
