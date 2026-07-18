'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProductManagementView } from '@/components/admin/ProductManagementView';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  clearStaffSession,
  loadStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

export default function AdminProductsPage() {
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    setSession(loadStaffSession());
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
    <div className="fixed inset-0 z-50 flex flex-col bg-night text-white">
      <header className="flex flex-wrap items-center gap-4 border-b border-surface-3 bg-ink-dark/95 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime font-display text-lg font-extrabold text-lime-ink">
          P
        </span>
        <div>
          <div className="font-display text-lg font-bold">Админ · Товары</div>
          <div className="text-xs text-subtle">Каталог, AI-обогащение, price/archive через approvals · {session.username}</div>
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
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <ProductManagementView accessToken={session.accessToken} />
      </main>
    </div>
  );
}
