'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { MobileTabBar, type Tab } from '@/components/MobileTabBar';
import { useFavorites } from '@/lib/favorites';

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
  const { count: favCount } = useFavorites();
  return (
    <div className="flex min-h-screen justify-center bg-night font-sans text-white">
      <div className="flex min-h-screen w-full max-w-[440px] flex-col bg-ink-dark">
        {header && (
          <header className="sticky top-0 z-20 flex-shrink-0 bg-ink-dark/95 px-4 pb-3 pt-3 backdrop-blur">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-muted">📍 {city} ▾</span>
              <div className="ml-auto flex items-center gap-3.5">
                <Link href="/compare" className="relative text-[17px]" aria-label="Сравнение">
                  ⇄
                  {favCount > 0 && (
                    <span className="absolute -right-2 -top-1.5 rounded-full bg-lime px-1 text-[9px] font-bold text-lime-ink">
                      {favCount}
                    </span>
                  )}
                </Link>
                <Link href="/account/notifications" className="relative text-[17px]" aria-label="Уведомления">
                  🔔
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-coral" />
                </Link>
              </div>
            </div>
            <Link
              href="/search"
              className="flex items-center gap-2.5 rounded-[13px] border border-surface-3 bg-surface-2 px-3.5 py-2.5"
            >
              <span className="text-faint">🔍</span>
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
