'use client';

import { som } from '@/lib/format';
import type { PosPendingApproval, PosSaleResult } from '@/lib/api';
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
  onSelectMethod: (id: string) => void;
  onFinish: () => void;
  onCancel: () => void;
  onNewSale: () => void;
  onPrintReceipt?: () => void;
}

/** POS checkout overlay: payment method → pending-approval (discount over limit) → done. */
export function PosCheckout(props: PosCheckoutProps) {
  const { route, total, discountLimit, method, busy, pending, result, offlineResult } = props;
  const pendingMessage = pending ? approvalMessage(pending, discountLimit) : '';
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(10,8,6,0.82)] p-4">
      <div className="w-full max-w-[640px] rounded-[22px] border border-[#2E2822] bg-[#1A1611] p-7">
        {route === 'pending' && pending && (
          <div className="py-4 text-center">
            <div className="mx-auto grid h-[76px] w-[76px] place-items-center rounded-full bg-warn/15 text-4xl text-warn">🔒</div>
            <div className="mt-4 font-display text-2xl font-extrabold text-white">Нужно одобрение</div>
            <div className="mt-2 text-sm text-[#A79C92]">
              {pendingMessage} Продажа не проведена — ожидает одобрения старшего в Approval Inbox.
            </div>
            <div className="mt-3 rounded-[12px] border border-[#2E2822] bg-[#221E19] px-4 py-2.5 font-mono text-xs text-[#8A7F76]">
              approval #{pending.approvalId.slice(-8)}
            </div>
            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={props.onFinish}
                className="flex-1 rounded-[12px] bg-lime py-3.5 text-[15px] font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]"
              >
                {busy ? 'Проверяем…' : 'Провести после одобрения'}
              </button>
              <button type="button" onClick={props.onCancel} className="rounded-[12px] border border-[#2E2822] bg-[#221E19] px-6 py-3.5 text-[15px] font-semibold text-[#D8CFC6]">
                Отмена
              </button>
            </div>
          </div>
        )}

        {route === 'pay' && (
          <>
            <div className="mb-1 flex items-center">
              <span className="font-display text-xl font-bold text-white">Оплата</span>
              <span className="ml-auto font-display text-2xl font-extrabold text-lime tabular">{som(total)}</span>
            </div>
            <div className="mb-4 text-[13px] text-[#8A7F76]">Выберите способ оплаты</div>
            <div className="grid grid-cols-2 gap-2.5">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => props.onSelectMethod(m.id)}
                  className={`flex items-center gap-2.5 rounded-[12px] border bg-[#221E19] p-3.5 text-left transition ${
                    method === m.id ? 'border-lime ring-1 ring-lime/40' : 'border-[#2E2822] hover:border-[#3A342E]'
                  }`}
                >
                  <span className="text-xl">{m.icon}</span>
                  <span className="text-sm font-semibold text-white">{m.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                disabled={!method || busy}
                onClick={props.onFinish}
                className="flex-1 rounded-[12px] py-3.5 text-center text-[15px] font-bold transition disabled:cursor-not-allowed"
                style={{ background: method && !busy ? '#C6FF3D' : '#3A342E', color: method && !busy ? '#14110E' : '#6E645C' }}
              >
                {busy ? 'Проводим…' : 'Завершить продажу'}
              </button>
              <button type="button" onClick={props.onCancel} className="rounded-[12px] border border-[#2E2822] bg-[#221E19] px-6 py-3.5 text-[15px] font-semibold text-[#D8CFC6]">
                Отмена
              </button>
            </div>
          </>
        )}

        {route === 'done' && (result || offlineResult) && (
          <div className="py-5 text-center">
            <div className="mx-auto grid h-[76px] w-[76px] place-items-center rounded-full bg-lime/15 text-4xl text-lime">
              {result ? '✓' : '↻'}
            </div>
            <div className="mt-4 font-display text-2xl font-extrabold text-white">
              {result ? 'Продажа завершена' : 'Продажа сохранена offline'}
            </div>
            {result ? (
              <div className="mt-2 text-sm text-[#A79C92]">Чек {result.receiptNo} · {som(result.total)} · записано в Event Ledger</div>
            ) : (
              <div className="mt-2 text-sm text-[#A79C92]">
                Локальный чек {offlineResult?.localReceiptNo} · {som(offlineResult?.snapshot.total ?? total)} · уйдёт в синхронизацию
              </div>
            )}
            {result?.imeis.length ? (
              <div className="mt-2 font-mono text-xs text-[#6E645C]">IMEI: {result.imeis.join(', ')}</div>
            ) : null}
            <div className="mt-6 flex justify-center gap-2.5">
              <button type="button" onClick={props.onNewSale} className="rounded-[11px] bg-lime px-6 py-3 font-bold text-lime-ink">
                Новая продажа
              </button>
              {props.onPrintReceipt && (
                <button type="button" onClick={props.onPrintReceipt} className="rounded-[11px] border border-[#2E2822] bg-[#221E19] px-6 py-3 font-bold text-[#D8CFC6]">
                  Печать
                </button>
              )}
            </div>
            {!result && (
              <div className="mx-auto mt-3 max-w-[420px] text-xs leading-relaxed text-[#6E645C]">
                Это не резерв на сервере. Если при синхронизации товар уже продан, строка останется в очереди как конфликт.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
