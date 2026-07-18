'use client';

import { som } from '@/lib/format';
import type { Approval } from '@/lib/api';

const ACTION_LABEL: Record<string, string> = {
  refund: 'Возврат денег',
  discount: 'Скидка сверх лимита',
  write_off: 'Списание',
  quarantine_write_off: 'Списание карантина',
  price: 'Изменение цены',
  stock_adjust: 'Изменение остатка',
  debt: 'Продажа в долг',
  delete: 'Удаление товара',
  pii: 'Доступ к PII',
  exchange: 'Обмен устройства',
};

/** Approval actions whose approved result is a write-off movement with a printable act. */
const WRITE_OFF_ACTIONS = new Set(['write_off', 'quarantine_write_off']);

interface ApprovalListProps {
  items: Approval[];
  tabStatus: string;
  busy: string | null;
  onDecide: (approval: Approval, status: 'approved' | 'rejected') => void;
  /** Present only when the role holds documents:read — wires the write-off act download. */
  onDownloadWriteOffAct?: (approval: Approval) => void;
}

/**
 * The list of dangerous-action approvals for the active tab. In the "requested" tab each
 * row exposes approve/reject; other tabs show the resolved status + approver.
 * Presentational — decide/2FA state lives in the Approval Inbox page.
 */
export function ApprovalList({ items, tabStatus, busy, onDecide, onDownloadWriteOffAct }: ApprovalListProps) {
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
            {a.action === 'exchange' && a.evidence?.payload && (
              <div className="mt-3 grid gap-1 rounded-md bg-ink/[0.03] p-3 text-xs text-ink/65 sm:grid-cols-2">
                <span className="font-mono">{a.evidence.payload.oldImei} → {a.evidence.payload.newImei}</span>
                <span>Зачёт {som(a.evidence.payload.creditAmount ?? 0)} · доплата {som(a.evidence.payload.surchargeAmount ?? 0)}</span>
                <span>Оплата: {a.evidence.payload.method ?? '—'}</span>
                <span className="font-mono">Смена/reference: {a.evidence.payload.shiftId ?? a.evidence.payload.externalReference ?? 'без доплаты'}</span>
                <span className="sm:col-span-2">Фото состояния обязательно; исполнение использует только зафиксированный snapshot.</span>
              </div>
            )}

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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="font-mono text-xs text-ink/40">
                  {a.status} · {a.approver ?? '—'}
                </p>
                {a.status === 'approved' && WRITE_OFF_ACTIONS.has(a.action) && onDownloadWriteOffAct && (
                  <button
                    type="button"
                    disabled={busy === `writeoff-act-${a.id}`}
                    onClick={() => onDownloadWriteOffAct(a)}
                    className="rounded-btn border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/30 disabled:opacity-50"
                  >
                    {busy === `writeoff-act-${a.id}` ? '…' : '⎙ Акт списания'}
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
