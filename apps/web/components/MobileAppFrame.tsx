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
      <SiteHeader />
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
