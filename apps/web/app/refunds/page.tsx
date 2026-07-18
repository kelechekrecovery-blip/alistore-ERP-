'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  cancelRefund,
  fetchRefund,
  fetchStaffReturns,
  resolveRefund,
  retryRefund,
  type RefundAggregate,
  type ReturnRequest,
} from '@/lib/api';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { canManageRefunds, canReadRefunds, canRetryRefund } from '@/lib/staff-permissions';
import {
  clearStaffSession,
  loadStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

/** Statuses the processor will still pick up (mirror RefundProcessor.processRefund). */
const RETRYABLE = ['approved', 'processing', 'partially_succeeded', 'failed'];
/** Statuses eligible for manual confirm/cancel reconciliation without a callback. */
const RESOLVABLE = ['processing', 'partially_succeeded', 'failed'];

const STATUS_LABELS: Record<string, string> = {
  requested: 'Запрошен',
  approved: 'Одобрен',
  processing: 'Исполняется',
  partially_succeeded: 'Частично исполнен',
  succeeded: 'Исполнен',
  failed: 'Ошибка',
  rejected: 'Отменён',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export default function RefundsPage() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [returns, setReturns] = useState<ReturnRequest[] | null>(null);
  const [selected, setSelected] = useState<RefundAggregate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [cancelForm, setCancelForm] = useState({ id: '', reason: '' });
  const [resolveForm, setResolveForm] = useState({ id: '', action: 'confirm' as 'confirm' | 'cancel', reason: '', providerReference: '' });

  useEffect(() => {
    setSession(loadStaffSession());
  }, []);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  }

  const loadReturns = useCallback((token = session?.accessToken) => {
    if (!token) return Promise.resolve();
    return fetchStaffReturns(token).then(setReturns).catch(() => setReturns([]));
  }, [session?.accessToken]);

  useEffect(() => {
    loadReturns();
  }, [loadReturns]);

  const openRefund = useCallback(async (refundId: string, token = session?.accessToken) => {
    if (!token) return;
    try {
      setSelected(await fetchRefund(refundId, token));
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Не удалось загрузить refund');
    }
  }, [session?.accessToken]);

  async function refresh(refundId?: string) {
    await loadReturns();
    if (refundId) await openRefund(refundId);
  }

  async function doRetry(refund: RefundAggregate) {
    if (!session) return;
    setBusy(`retry-${refund.id}`);
    try {
      await retryRefund(refund.id, session.accessToken);
      await refresh(refund.id);
      flash('Refund поставлен на повторное исполнение');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка повтора refund');
    } finally {
      setBusy(null);
    }
  }

  async function submitCancel(event: FormEvent) {
    event.preventDefault();
    if (!session || !cancelForm.id || cancelForm.reason.trim().length < 3) return;
    setBusy(`cancel-${cancelForm.id}`);
    try {
      const storageKey = `alistore.refund.cancel.${cancelForm.id}`;
      const idempotencyKey = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, idempotencyKey);
      await cancelRefund(cancelForm.id, { reason: cancelForm.reason.trim() }, session.accessToken, idempotencyKey);
      window.sessionStorage.removeItem(storageKey);
      setCancelForm({ id: '', reason: '' });
      await refresh(cancelForm.id);
      flash('Refund отменён после сверки');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка отмены refund');
    } finally {
      setBusy(null);
    }
  }

  async function submitResolve(event: FormEvent) {
    event.preventDefault();
    if (!session || !resolveForm.id || resolveForm.reason.trim().length < 3) return;
    if (resolveForm.action === 'confirm' && !resolveForm.providerReference.trim()) {
      flash('Укажите подтверждение провайдера');
      return;
    }
    setBusy(`resolve-${resolveForm.id}`);
    try {
      const storageKey = `alistore.refund.resolve.${resolveForm.id}.${resolveForm.action}`;
      const idempotencyKey = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, idempotencyKey);
      await resolveRefund(
        resolveForm.id,
        {
          action: resolveForm.action,
          reason: resolveForm.reason.trim(),
          providerReference: resolveForm.providerReference.trim() || undefined,
        },
        session.accessToken,
        idempotencyKey,
      );
      window.sessionStorage.removeItem(storageKey);
      setResolveForm({ id: '', action: 'confirm', reason: '', providerReference: '' });
      await refresh(resolveForm.id);
      flash(resolveForm.action === 'confirm' ? 'Refund подтверждён по выписке провайдера' : 'Refund отменён оператором');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка разрешения refund');
    } finally {
      setBusy(null);
    }
  }

  const refundsWithReturn = (returns ?? []).filter((ret) => ret.refund);

  return (
    <div className="erp3-stage fixed inset-0 z-50 flex flex-col bg-night bg-grain text-white">
      <header className="flex items-center gap-4 border-b border-surface-3 bg-ink-dark/90 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-coral font-display text-lg font-extrabold text-white">R</span>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · Refunds 3.0</div>
          <div className="font-display text-lg font-bold text-white">Возвраты денег</div>
          <div className="text-xs text-subtle">Операции с refund · {session ? session.role : 'требуется вход'}</div>
        </div>
        {session && (
          <button
            type="button"
            onClick={() => {
              clearStaffSession();
              setSession(null);
              setReturns(null);
              setSelected(null);
            }}
            className="ml-auto rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30"
          >
            Выйти staff
          </button>
        )}
        <Link
          href="/approvals"
          className={session ? 'rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30' : 'ml-auto rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30'}
        >
          ← Одобрения
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {!session && (
            <div className="flex justify-center">
              <StaffSessionLogin
                mode="light"
                title="Возвраты денег · вход"
                caption="Войдите учётной записью admin/owner, чтобы оперировать refund."
                onAuthenticated={setSession}
              />
            </div>
          )}
          {session && !canReadRefunds(session.role) && (
            <div className="rounded-card border border-dashed border-ink/15 bg-white/50 px-6 py-16 text-center">
              <p className="font-display text-lg font-bold text-ink">Нет доступа</p>
              <p className="mt-1 text-sm text-ink/55">Операции с refund доступны ролям admin и owner.</p>
            </div>
          )}
          {session && canReadRefunds(session.role) && (
            <>
              <section className="mb-4 rounded-card border border-ink/10 bg-white p-4 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-base font-bold text-ink">Refund со статусами</div>
                    <div className="mt-1 text-sm text-ink/55">Все refund, созданные по возвратам товаров.</div>
                  </div>
                  <button type="button" onClick={() => refresh(selected?.id)} className="rounded-btn border border-ink/15 px-3 py-2 text-xs font-semibold text-ink">
                    Обновить
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {returns === null && <p className="font-mono text-sm text-ink/40">Загрузка…</p>}
                  {returns !== null && refundsWithReturn.length === 0 && (
                    <div className="rounded-btn bg-sand/70 px-4 py-3 text-sm text-ink/50">Refund пока не создавались</div>
                  )}
                  {refundsWithReturn.map((ret) => {
                    const refund = ret.refund!;
                    const pending = refund.allocations.filter((allocation) => ['queued', 'processing', 'provider_pending', 'failed'].includes(allocation.status)).length;
                    return (
                      <button
                        key={refund.id}
                        type="button"
                        onClick={() => openRefund(refund.id)}
                        className={`flex w-full flex-wrap items-center gap-3 rounded-btn border px-4 py-3 text-left ${selected?.id === refund.id ? 'border-ink/40 bg-sand/60' : 'border-ink/10'}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-xs text-ink/55">{refund.id}</div>
                          <div className="mt-1 text-sm font-semibold text-ink">{refund.amount.toLocaleString('ru-RU')} сом · возврат {ret.id.slice(-8)}</div>
                        </div>
                        {pending > 0 && <span className="text-xs text-ink/45">{pending} аллокац. в работе</span>}
                        <span className={`rounded-chip px-3 py-1 text-xs font-semibold ${refund.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-sand text-ink/65'}`}>
                          {statusLabel(refund.status)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {selected && (
                <section className="mb-4 rounded-card border border-ink/10 bg-white p-4 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-display text-base font-bold text-ink">Refund · {statusLabel(selected.status)}</div>
                      <div className="mt-1 font-mono text-xs text-ink/50">{selected.id}</div>
                    </div>
                    <span className="rounded-chip bg-sand px-3 py-1 text-xs font-semibold text-ink/65">
                      одобрение: {selected.approval.status}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-ink/70">
                    {selected.amount.toLocaleString('ru-RU')} сом · {selected.reason}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {selected.allocations.map((allocation) => (
                      <div key={allocation.id} className="flex flex-wrap items-center gap-2 rounded-btn bg-sand/60 px-3 py-2 text-xs">
                        <span className="font-mono text-ink/55">{allocation.methodSnapshot}</span>
                        <span className="font-semibold text-ink">{allocation.amount.toLocaleString('ru-RU')} сом</span>
                        <span className={`rounded-chip px-2 py-0.5 font-semibold ${allocation.status === 'failed' ? 'bg-danger/10 text-danger' : allocation.status === 'succeeded' ? 'bg-success/10 text-success' : 'bg-white text-ink/60'}`}>
                          {allocation.status}
                        </span>
                        {allocation.lastError && <span className="basis-full text-ink/45">{allocation.lastError}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {canRetryRefund(session.role) && RETRYABLE.includes(selected.status) && (
                      <button
                        type="button"
                        disabled={busy === `retry-${selected.id}`}
                        onClick={() => doRetry(selected)}
                        className="rounded-btn bg-ink px-4 py-2.5 text-sm font-semibold text-sand disabled:opacity-50"
                      >
                        {busy === `retry-${selected.id}` ? '…' : 'Повторить исполнение'}
                      </button>
                    )}
                    {canManageRefunds(session.role) && selected.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => setCancelForm({ id: selected.id, reason: '' })}
                        className="rounded-btn border border-danger/30 px-4 py-2.5 text-sm font-semibold text-danger"
                      >
                        Отменить refund
                      </button>
                    )}
                    {canManageRefunds(session.role) && RESOLVABLE.includes(selected.status) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setResolveForm({ id: selected.id, action: 'confirm', reason: '', providerReference: '' })}
                          className="rounded-btn bg-success px-4 py-2.5 text-sm font-semibold text-white"
                        >
                          Провайдер подтвердил
                        </button>
                        <button
                          type="button"
                          onClick={() => setResolveForm({ id: selected.id, action: 'cancel', reason: '', providerReference: '' })}
                          className="rounded-btn border border-danger/30 px-4 py-2.5 text-sm font-semibold text-danger"
                        >
                          Провайдер не исполнял
                        </button>
                      </>
                    )}
                  </div>
                </section>
              )}

              {cancelForm.id && (
                <form onSubmit={submitCancel} className="mb-4 rounded-card border border-danger/20 bg-white p-4 shadow-soft">
                  <div className="font-display text-base font-bold text-ink">Отмена неисполненного refund</div>
                  <div className="mt-1 font-mono text-xs text-ink/50">{cancelForm.id}</div>
                  <input
                    value={cancelForm.reason}
                    onChange={(e) => setCancelForm((v) => ({ ...v, reason: e.target.value }))}
                    placeholder="Основание отмены (обязательно)"
                    aria-label="Основание отмены refund"
                    required
                    minLength={3}
                    className="mt-3 min-h-11 w-full rounded-btn border border-ink/15 px-4 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="submit" disabled={busy === `cancel-${cancelForm.id}`} className="rounded-btn bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                      {busy === `cancel-${cancelForm.id}` ? 'Сохраняем…' : 'Отменить refund'}
                    </button>
                    <button type="button" onClick={() => setCancelForm({ id: '', reason: '' })} className="rounded-btn border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/70">
                      Закрыть
                    </button>
                  </div>
                </form>
              )}

              {resolveForm.id && (
                <form onSubmit={submitResolve} className="mb-4 rounded-card border border-danger/20 bg-white p-4 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-display text-base font-bold text-ink">Сверка зависшего refund</div>
                      <div className="mt-1 font-mono text-xs text-ink/50">{resolveForm.id}</div>
                    </div>
                    <span className="rounded-chip bg-sand px-3 py-1 text-xs font-semibold text-ink/65">
                      {resolveForm.action === 'confirm' ? 'подтвердить исполнение' : 'отменить исполнение'}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <input
                      value={resolveForm.reason}
                      onChange={(e) => setResolveForm((v) => ({ ...v, reason: e.target.value }))}
                      placeholder="Основание сверки (обязательно)"
                      aria-label="Основание сверки refund"
                      required
                      minLength={3}
                      className="min-h-11 rounded-btn border border-ink/15 px-4 py-2.5 text-sm outline-none focus:border-ink/40"
                    />
                    {resolveForm.action === 'confirm' && (
                      <input
                        value={resolveForm.providerReference}
                        onChange={(e) => setResolveForm((v) => ({ ...v, providerReference: e.target.value }))}
                        placeholder="ID операции / ссылка на выписку"
                        aria-label="Подтверждение провайдера"
                        required
                        className="min-h-11 rounded-btn border border-ink/15 px-4 py-2.5 font-mono text-sm outline-none focus:border-ink/40"
                      />
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="submit" disabled={busy === `resolve-${resolveForm.id}`} className="rounded-btn bg-ink px-4 py-2.5 text-sm font-semibold text-sand disabled:opacity-50">
                      {busy === `resolve-${resolveForm.id}` ? 'Сохраняем…' : 'Зафиксировать решение'}
                    </button>
                    <button type="button" onClick={() => setResolveForm({ id: '', action: 'confirm', reason: '', providerReference: '' })} className="rounded-btn border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/70">
                      Закрыть
                    </button>
                  </div>
                </form>
              )}
            </>
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
