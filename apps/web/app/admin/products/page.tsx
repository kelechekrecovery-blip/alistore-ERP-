'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProductManagementView } from '@/components/admin/ProductManagementView';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  clearStaffSession,
  restoreStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

export default function AdminProductsPage() {
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    void restoreStaffSession().then(setSession);
  }, []);

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-night p-4">
        <Link
          href="/"
          className="fixed right-4 top-4 z-[60] rounded-chip bg-surface-2 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          ⌂ Выйти
        </Link>
        <StaffSessionLogin
          title="Товары · вход"
          caption="Войдите как admin или owner, чтобы управлять каталогом."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="erp3-stage fixed inset-0 z-50 flex flex-col bg-[#0B0A08] text-white">
      <header className="flex flex-wrap items-center gap-4 border-b border-white/10 bg-black/25 px-6 py-4 backdrop-blur-2xl">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#FF5B2E] font-display text-lg font-extrabold text-white shadow-[0_0_24px_rgba(255,91,46,0.25)]">A</span>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · Products 3.0</div>
          <div className="font-display text-lg font-bold">Управление товарами</div>
          <div className="text-xs text-subtle">Каталог, варианты, цены и публикация через approvals · {session.username}</div>
        </div>
        <Link
          href="/erp"
          className="ml-auto rounded-chip border border-surface-3 px-4 py-2 text-sm font-medium text-bright hover:border-line"
        >
          ERP · Сайт
        </Link>
        <Link
          href="/approvals"
          className="rounded-chip border border-surface-3 px-4 py-2 text-sm font-medium text-bright hover:border-line"
        >
          Approval Inbox
        </Link>
        <button
          type="button"
          onClick={() => {
            clearStaffSession();
            setSession(null);
          }}
          className="rounded-chip border border-surface-3 px-4 py-2 text-sm font-medium text-subtle hover:border-line"
        >
          Выйти staff
        </button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap gap-2 text-[11px] text-subtle"><span className="rounded-full border border-[#FF5B2E]/40 bg-[#FF5B2E]/10 px-3 py-1.5 text-[#FF7A4D]">Варианты и наборы</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">История цены</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">AI-обогащение</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Публикация</span></div>
        <ProductManagementView accessToken={session.accessToken} />
      </main>
    </div>
  );
}
