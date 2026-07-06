'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { decideApproval, fetchApprovals, type Approval } from '@/lib/api';
import { som } from '@/lib/format';

const APPROVER = 'admin_gulnara';

const TABS = [
  { status: 'requested', label: 'Ожидают' },
  { status: 'approved', label: 'Одобрено' },
  { status: 'rejected', label: 'Отклонено' },
];

const ACTION_LABEL: Record<string, string> = {
  refund: 'Возврат денег',
  discount: 'Скидка сверх лимита',
  write_off: 'Списание',
  price: 'Изменение цены',
  stock_adjust: 'Изменение остатка',
  debt: 'Продажа в долг',
  delete: 'Удаление товара',
  pii: 'Доступ к PII',
};

export default function ApprovalsPage() {
  const [tab, setTab] = useState(TABS[0]);
  const [items, setItems] = useState<Approval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback((status: string) => {
    setItems(null);
    fetchApprovals(status)
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    load(tab.status);
  }, [tab, load]);

  function flash(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(''), 1800);
  }

  async function decide(a: Approval, status: 'approved' | 'rejected') {
    setBusy(a.id);
    try {
      await decideApproval(a.id, status, APPROVER);
      flash(status === 'approved' ? 'Одобрено · действие выполнено' : 'Отклонено');
      load(tab.status);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sand bg-grain">
      <header className="flex items-center gap-4 border-b border-ink/10 bg-white/80 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-warn font-display text-lg font-extrabold text-lime-ink">
          ✓
        </span>
        <div>
          <div className="font-display text-lg font-bold text-ink">Approval Inbox</div>
          <div className="text-xs text-ink/50">Одобрение опасных действий · {APPROVER}</div>
        </div>
        <Link
          href="/"
          className="ml-auto rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30"
        >
          ⌂ Выйти
        </Link>
      </header>

      <div className="flex flex-shrink-0 gap-2 border-b border-ink/10 bg-white/50 px-6 py-3">
        {TABS.map((t) => (
          <button
            key={t.status}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-chip px-4 py-2 text-sm font-semibold transition ${
              tab.status === t.status
                ? 'bg-ink text-sand'
                : 'border border-ink/15 bg-white text-ink/70 hover:border-ink/30'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {items === null && <p className="font-mono text-sm text-ink/40">Загрузка…</p>}
          {items && items.length === 0 && (
            <div className="rounded-card border border-dashed border-ink/15 bg-white/50 px-6 py-16 text-center">
              <p className="font-display text-lg font-bold text-ink">Пусто</p>
              <p className="mt-1 text-sm text-ink/55">Нет заявок в статусе «{tab.label}».</p>
            </div>
          )}
          {items && items.length > 0 && (
            <ul className="flex flex-col gap-3">
              {items.map((a) => {
                const amount = a.evidence?.payload?.amount;
                return (
                  <li key={a.id} className="rounded-card border border-ink/10 bg-white p-5 shadow-soft">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-chip bg-danger/10 px-3 py-1 text-xs font-bold text-danger">
                        {ACTION_LABEL[a.action] ?? a.action}
                      </span>
                      <span className="font-mono text-xs text-ink/45">#{a.id.slice(-8)}</span>
                      <span className="text-sm text-ink/60">от {a.requester}</span>
                      {typeof amount === 'number' && (
                        <span className="ml-auto font-mono text-lg font-bold tabular text-ink">
                          {som(amount)}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-ink/70">Причина: {a.reason}</p>

                    {tab.status === 'requested' ? (
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          disabled={busy === a.id}
                          onClick={() => decide(a, 'approved')}
                          className="rounded-btn bg-success px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                        >
                          {busy === a.id ? '…' : 'Одобрить'}
                        </button>
                        <button
                          type="button"
                          disabled={busy === a.id}
                          onClick={() => decide(a, 'rejected')}
                          className="rounded-btn border border-danger/30 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-50"
                        >
                          Отклонить
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 font-mono text-xs text-ink/40">
                        {a.status} · {a.approver ?? '—'}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {toast && (
        <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-btn bg-ink px-6 py-3 text-sm font-semibold text-sand">
          {toast}
        </div>
      )}
    </div>
  );
}
