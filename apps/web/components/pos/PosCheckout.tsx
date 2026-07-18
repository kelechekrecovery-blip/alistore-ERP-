'use client';

import { useEffect, useMemo, useState } from 'react';
import { som } from '@/lib/format';
import type { PosPayment, PosPendingApproval, PosSaleResult } from '@/lib/api';
import type { OfflinePosQueueItem } from '@/lib/pos-offline';

const METHODS: { id: string; icon: string; name: string }[] = [
  { id: 'cash', icon: '💵', name: 'Наличные' },
  { id: 'card', icon: '💳', name: 'Карта' },
  { id: 'qr_mbank', icon: '📱', name: 'MBank QR' },
  { id: 'qr_odengi', icon: '📱', name: 'O!Деньги' },
  { id: 'bakai_pos', icon: '🏦', name: 'Bakai POS' },
  { id: 'obank', icon: '🏦', name: 'О!Банк' },
  { id: 'installment', icon: '📅', name: 'Рассрочка' },
];

interface PosCheckoutProps {
  route: 'pay' | 'pending' | 'done';
  total: number;
  discountLimit: number;
  method: string | null;
  busy: boolean;
  pending: PosPendingApproval | null;
  result: PosSaleResult | null;
  offlineResult?: OfflinePosQueueItem | null;
  completion?: { title: string; reference: string; total: number } | null;
  title?: string;
  confirmLabel?: string;
  newLabel?: string;
  allowedMethods?: string[];
  onSelectMethod: (id: string) => void;
  onFinish: (payments?: PosPayment[]) => void;
  onCancel: () => void;
  onNewSale: () => void;
  onPrintReceipt?: () => void;
  onPrintServerReceipt?: () => void;
  serverPrintBusy?: boolean;
}

/** POS checkout overlay: payment method → pending-approval (discount over limit) → done. */
export function PosCheckout(props: PosCheckoutProps) {
  const { route, total, discountLimit, method, busy, pending, result, offlineResult } = props;
  const methods = useMemo(
    () => props.allowedMethods?.length ? METHODS.filter((candidate) => props.allowedMethods?.includes(candidate.id)) : METHODS,
    [props.allowedMethods],
  );
  const [split, setSplit] = useState(false);
  const [splitPayments, setSplitPayments] = useState<PosPayment[]>(() => defaultSplit(total, method, methods));
  const pendingMessage = pending ? approvalMessage(pending, discountLimit) : '';
  const activePayments = useMemo(
    () => (split ? splitPayments : method ? [{ method, amount: total }] : []),
    [method, split, splitPayments, total],
  );
  const splitTotal = splitPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const splitRemainder = total - splitTotal;
  const splitValid = splitPayments.length >= 2 && splitPayments.every((payment) => payment.method && payment.amount > 0) && splitTotal === total;
  const canFinish = split ? splitValid : Boolean(method);

  useEffect(() => {
    if (route === 'pay') {
      setSplit(false);
      setSplitPayments(defaultSplit(total, method, methods));
    }
  }, [method, methods, route, total]);

  useEffect(() => {
    if (!split) setSplitPayments(defaultSplit(total, method, methods));
  }, [method, methods, split, total]);

  function updateSplitPayment(index: number, patch: Partial<PosPayment>) {
    setSplitPayments((current) => current.map((payment, row) => (row === index ? { ...payment, ...patch } : payment)));
  }

  function fillRemainder(index: number) {
    const otherTotal = splitPayments.reduce((sum, payment, row) => (row === index ? sum : sum + payment.amount), 0);
    updateSplitPayment(index, { amount: Math.max(total - otherTotal, 0) });
  }

  function addSplitPayment() {
    const existing = new Set(splitPayments.map((payment) => payment.method));
    const nextMethod = methods.find((candidate) => !existing.has(candidate.id))?.id ?? methods[0]?.id ?? 'cash';
    setSplitPayments((current) => [...current, { method: nextMethod, amount: Math.max(total - splitTotal, 0) }]);
  }

  function removeSplitPayment(index: number) {
    setSplitPayments((current) => current.filter((_, row) => row !== index));
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(10,8,6,0.82)] p-4">
      <div className="w-full max-w-[640px] rounded-[22px] border border-surface-3 bg-surface p-7">
        {route === 'pending' && pending && (
          <div className="py-4 text-center">
            <div className="mx-auto grid h-[76px] w-[76px] place-items-center rounded-full bg-warn/15 text-4xl text-warn">🔒</div>
            <div className="mt-4 font-display text-2xl font-extrabold text-white">Нужно одобрение</div>
            <div className="mt-2 text-sm text-muted">
              {pendingMessage} Продажа не проведена — ожидает одобрения старшего в Approval Inbox.
            </div>
            <div className="mt-3 rounded-[12px] border border-surface-3 bg-surface-2 px-4 py-2.5 font-mono text-xs text-subtle">
              approval #{pending.approvalId.slice(-8)}
            </div>
            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => props.onFinish(activePayments)}
                className="flex-1 rounded-[12px] bg-lime py-3.5 text-[15px] font-bold text-lime-ink disabled:bg-line disabled:text-faint"
              >
                {busy ? 'Проверяем…' : 'Провести после одобрения'}
              </button>
              <button type="button" onClick={props.onCancel} className="rounded-[12px] border border-surface-3 bg-surface-2 px-6 py-3.5 text-[15px] font-semibold text-bright">
                Отмена
              </button>
            </div>
          </div>
        )}

        {route === 'pay' && (
          <>
            <div className="mb-1 flex items-center" data-testid="pos-checkout">
              <span className="font-display text-xl font-bold text-white">{props.title ?? 'Оплата'}</span>
              <span className="ml-auto font-display text-2xl font-extrabold text-lime tabular">{som(total)}</span>
            </div>
            <div className="mb-4 flex rounded-[12px] border border-surface-3 bg-[#120F0C] p-1">
              <button
                type="button"
                onClick={() => setSplit(false)}
                className={`flex-1 rounded-[9px] px-3 py-2 text-sm font-semibold ${!split ? 'bg-lime text-lime-ink' : 'text-muted'}`}
              >
                Один способ
              </button>
              <button
                type="button"
                onClick={() => {
                  setSplitPayments(defaultSplit(total, method, methods));
                  setSplit(true);
                }}
                className={`flex-1 rounded-[9px] px-3 py-2 text-sm font-semibold ${split ? 'bg-lime text-lime-ink' : 'text-muted'}`}
              >
                Split
              </button>
            </div>
            {!split ? (
              <div className="grid grid-cols-2 gap-2.5">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => props.onSelectMethod(m.id)}
                    className={`flex items-center gap-2.5 rounded-[12px] border bg-surface-2 p-3.5 text-left transition ${
                      method === m.id ? 'border-lime ring-1 ring-lime/40' : 'border-surface-3 hover:border-line'
                    }`}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <span className="text-sm font-semibold text-white">{m.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {splitPayments.map((payment, index) => (
                  <div key={`${index}-${payment.method}`} className="grid grid-cols-[1fr_132px_78px_38px] gap-2">
                    <select
                      data-testid={`split-payment-method-${index}`}
                      aria-label={`Способ оплаты ${index + 1}`}
                      value={payment.method}
                      onChange={(event) => updateSplitPayment(index, { method: event.target.value })}
                      className="min-w-0 rounded-[10px] border border-surface-3 bg-surface-2 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-lime"
                    >
                      {methods.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <input
                      data-testid={`split-payment-amount-${index}`}
                      aria-label={`Сумма оплаты ${index + 1}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={payment.amount}
                      onChange={(event) => updateSplitPayment(index, { amount: Math.max(0, Math.round(Number(event.target.value) || 0)) })}
                      className="min-w-0 rounded-[10px] border border-surface-3 bg-surface-2 px-3 py-2 text-right font-mono text-sm text-white outline-none focus:border-lime"
                    />
                    <button
                      type="button"
                      onClick={() => fillRemainder(index)}
                      className="rounded-[10px] border border-surface-3 bg-surface-2 px-2 text-xs font-semibold text-bright"
                    >
                      Остаток
                    </button>
                    <button
                      type="button"
                      disabled={splitPayments.length <= 2}
                      onClick={() => removeSplitPayment(index)}
                      className="rounded-[10px] border border-surface-3 bg-surface-2 text-lg font-semibold text-bright disabled:text-[#4B433B]"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-3 rounded-[10px] border border-surface-3 bg-[#120F0C] px-3 py-2 text-xs">
                  <span className="text-subtle">Распределено</span>
                  <span className="font-mono text-bright">{som(splitTotal)}</span>
                  <span className={splitRemainder === 0 ? 'text-lime' : 'text-warn'}>
                    Остаток {som(splitRemainder)}
                  </span>
                  <button type="button" onClick={addSplitPayment} className="ml-auto font-semibold text-lime hover:text-white">
                    + строка
                  </button>
                </div>
              </div>
            )}
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                data-testid={props.confirmLabel === 'Оплатить ремонт' ? 'service-payment-submit' : undefined}
                disabled={!canFinish || busy}
                onClick={() => props.onFinish(activePayments)}
                className="flex-1 rounded-[12px] py-3.5 text-center text-[15px] font-bold transition disabled:cursor-not-allowed"
                style={{ background: canFinish && !busy ? '#C6FF3D' : '#3A342E', color: canFinish && !busy ? '#14110E' : '#6E645C' }}
              >
                {busy ? 'Проводим…' : (props.confirmLabel ?? 'Завершить продажу')}
              </button>
              <button type="button" onClick={props.onCancel} className="rounded-[12px] border border-surface-3 bg-surface-2 px-6 py-3.5 text-[15px] font-semibold text-bright">
                Отмена
              </button>
            </div>
          </>
        )}

        {route === 'done' && (result || offlineResult || props.completion) && (
          <div className="py-5 text-center">
            <div className="mx-auto grid h-[76px] w-[76px] place-items-center rounded-full bg-lime/15 text-4xl text-lime">
              {result || props.completion ? '✓' : '↻'}
            </div>
            <div className="mt-4 font-display text-2xl font-extrabold text-white">
              {props.completion?.title ?? (result ? 'Продажа завершена' : 'Продажа сохранена offline')}
            </div>
            {props.completion ? (
              <div className="mt-2 text-sm text-muted">{props.completion.reference} · {som(props.completion.total)} · записано в Event Ledger</div>
            ) : result ? (
              <div className="mt-2 text-sm text-muted">Чек {result.receiptNo} · {som(result.total)} · записано в Event Ledger</div>
            ) : (
              <div className="mt-2 text-sm text-muted">
                Локальный чек {offlineResult?.localReceiptNo} · {som(offlineResult?.snapshot.total ?? total)} · уйдёт в синхронизацию
              </div>
            )}
            {result?.imeis.length ? (
              <div className="mt-2 font-mono text-xs text-faint">IMEI: {result.imeis.join(', ')}</div>
            ) : null}
            <div className="mt-6 flex justify-center gap-2.5">
              <button type="button" onClick={props.onNewSale} className="rounded-[11px] bg-lime px-6 py-3 font-bold text-lime-ink">
                {props.newLabel ?? 'Новая продажа'}
              </button>
              {props.onPrintReceipt && (
                <button type="button" onClick={props.onPrintReceipt} className="rounded-[11px] border border-surface-3 bg-surface-2 px-6 py-3 font-bold text-bright">
                  Печать
                </button>
              )}
              {props.onPrintServerReceipt && (
                <button
                  type="button"
                  disabled={props.serverPrintBusy}
                  onClick={props.onPrintServerReceipt}
                  className="rounded-[11px] border border-surface-3 bg-surface-2 px-6 py-3 font-bold text-bright disabled:text-faint"
                >
                  {props.serverPrintBusy ? 'Печать…' : 'Чек (сервер)'}
                </button>
              )}
            </div>
            {offlineResult && (
              <div className="mx-auto mt-3 max-w-[420px] text-xs leading-relaxed text-faint">
                Это не резерв на сервере. Если при синхронизации товар уже продан, строка останется в очереди как конфликт.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function defaultSplit(total: number, method: string | null, methods = METHODS): PosPayment[] {
  const primary = methods.some((candidate) => candidate.id === method) ? method! : methods[0]?.id ?? 'cash';
  const secondary = methods.find((candidate) => candidate.id !== primary)?.id ?? primary;
  return [
    { method: primary, amount: total },
    { method: secondary, amount: 0 },
  ];
}

function approvalMessage(pending: PosPendingApproval, discountLimit: number) {
  if (pending.reason === 'margin') {
    return `Маржа ${som(pending.margin?.worstMargin ?? 0)} ниже лимита ${som(pending.margin?.minMargin ?? 0)}.`;
  }
  if (pending.reason === 'discount_and_margin') {
    return `Скидка ${pending.discountPct}% превышает лимит ${discountLimit}%, маржа ${som(pending.margin?.worstMargin ?? 0)} ниже лимита ${som(pending.margin?.minMargin ?? 0)}.`;
  }
  return `Скидка ${pending.discountPct}% превышает лимит ${discountLimit}%.`;
}

export { METHODS };
