'use client';

import { som } from '@/lib/format';
import type { Approval } from '@/lib/api';

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

interface ApprovalListProps {
  items: Approval[];
  tabStatus: string;
  busy: string | null;
  onDecide: (approval: Approval, status: 'approved' | 'rejected') => void;
}

/**
 * The list of dangerous-action approvals for the active tab. In the "requested" tab each
 * row exposes approve/reject; other tabs show the resolved status + approver.
 * Presentational — decide/2FA state lives in the Approval Inbox page.
 */
export function ApprovalList({ items, tabStatus, busy, onDecide }: ApprovalListProps) {
  return (
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

            {tabStatus === 'requested' ? (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => onDecide(a, 'approved')}
                  className="rounded-btn bg-success px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                >
                  {busy === a.id ? '…' : 'Одобрить'}
                </button>
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => onDecide(a, 'rejected')}
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
  );
}
