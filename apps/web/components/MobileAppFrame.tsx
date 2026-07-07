'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { MobileTabBar } from './MobileTabBar';

type ActiveTab = 'home' | 'catalog' | 'cart' | 'account';

export function MobileAppFrame({
  title,
  subtitle,
  children,
  active = 'account',
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
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        <div className="flex-1 overflow-y-auto px-4 pb-24 pt-5">
          <div className="mb-4 flex items-start gap-3">
            {backHref ? (
              <Link href={backHref} className="pt-0.5 text-xl">←</Link>
            ) : (
              <button type="button" onClick={() => router.back()} className="pt-0.5 text-xl">←</button>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold leading-tight">{title}</h1>
              {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-[#A79C92]">{subtitle}</p>}
            </div>
          </div>
          {children}
        </div>
        <MobileTabBar active={active} />
      </div>
    </div>
  );
}
