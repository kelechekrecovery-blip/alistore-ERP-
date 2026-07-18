'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createDebt,
  fetchDebts,
  isDebtApproval,
  payDebt,
  type DebtPlan,
} from '@/lib/api';
import { som } from '@/lib/format';
import { canCreateDebt, canPayDebt, canReadDebts } from '@/lib/staff-permissions';

/**
 * Debt desk for the staff app: book a debt/installment sale and accept payments
 * against open plans. Idempotency keys are pinned in sessionStorage until the
 * command succeeds, mirroring the approvals-page refund pattern, so a retry after
 * a dropped network replays the same command instead of double-booking.
 */
export function DebtsDesk({
  accessToken,
  role,
  flash,
}: {
  accessToken: string;
  role: string;
  flash: (message: string) => void;
}) {
  const [debts, setDebts] = useState<DebtPlan[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    orderId: '',
    principal: '',
    termDays: '30',
    installments: '1',
    reason: '',
  });
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const rows = await fetchDebts({ status: 'open' }, accessToken);
      setDebts(rows);
      setPayAmounts((current) => Object.fromEntries(rows.map((debt) => [
        debt.id,
        current[debt.id] ?? String(debt.balance),
      ])));
    } catch {
      setDebts([]);
      setLoadError('Не удалось загрузить долги');
    }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    const orderId = createForm.orderId.trim();
    const principal = Number(createForm.principal);
    if (!orderId || !Number.isInteger(principal) || principal < 1) {
      flash('Укажите заказ и сумму долга');
      return;
    }
    setBusy('create');
    try {
      const storageKey = `alistore.debt.create.${orderId}`;
      const idempotencyKey = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, idempotencyKey);
      const result = await createDebt({
        orderId,
        principal,
        installments: Number(createForm.installments) > 1 ? Number(createForm.installments) : undefined,
        termDays: Number(createForm.termDays) > 0 ? Number(createForm.termDays) : undefined,
        reason: createForm.reason.trim() || undefined,
        idempotencyKey,
      }, accessToken);
      window.sessionStorage.removeItem(storageKey);
      setCreateForm({ orderId: '', principal: '', termDays: '30', installments: '1', reason: '' });
      await load();
      flash(isDebtApproval(result) ? 'Сумма выше лимита — долг отправлен на одобрение' : 'Долг оформлен');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка оформления долга');
    } finally {
      setBusy(null);
    }
  }

  async function submitPay(debt: DebtPlan) {
    const amount = Number(payAmounts[debt.id]);
    if (!Number.isInteger(amount) || amount < 1) {
      flash('Укажите сумму платежа');
      return;
    }
    setBusy(debt.id);
    try {
      const storageKey = `alistore.debt.pay.${debt.id}.${amount}`;
      const idempotencyKey = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, idempotencyKey);
      const result = await payDebt(debt.id, { amount, idempotencyKey }, accessToken);
      window.sessionStorage.removeItem(storageKey);
      setPayAmounts((current) => ({ ...current, [debt.id]: '' }));
      await load();
      flash(result.settled ? 'Долг погашен полностью' : `Платёж принят · остаток ${som(result.debt.balance)}`);
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка платежа по долгу');
    } finally {
      setBusy(null);
    }
  }

  if (!canCreateDebt(role) && !canReadDebts(role)) {
    return <p className="py-8 text-center text-sm text-[#8A7F76]">Нет доступа к операциям с долгами</p>;
  }

  return (
    <>
      {canCreateDebt(role) && (
        <form onSubmit={submitCreate} className="mb-4 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
          <div className="mb-3 font-display text-[15px] font-bold">Оформить долг / рассрочку</div>
          <DeskField
            label="Заказ"
            value={createForm.orderId}
            onChange={(orderId) => setCreateForm((f) => ({ ...f, orderId }))}
            placeholder="ID заказа"
            required
          />
          <DeskField
            label="Сумма"
            value={createForm.principal}
            onChange={(principal) => setCreateForm((f) => ({ ...f, principal }))}
            inputMode="numeric"
            required
          />
          <DeskField
            label="Срок, дней"
            value={createForm.termDays}
            onChange={(termDays) => setCreateForm((f) => ({ ...f, termDays }))}
            inputMode="numeric"
          />
          <DeskField
            label="Платежей"
            value={createForm.installments}
            onChange={(installments) => setCreateForm((f) => ({ ...f, installments }))}
            inputMode="numeric"
          />
          <DeskField
            label="Причина"
            value={createForm.reason}
            onChange={(reason) => setCreateForm((f) => ({ ...f, reason }))}
            placeholder="постоянный клиент"
          />
          <button
            type="submit"
            disabled={busy === 'create'}
            className="mt-2 w-full rounded-[11px] bg-lime py-3 text-center text-sm font-bold text-lime-ink disabled:opacity-60"
          >
            {busy === 'create' ? '…' : 'Оформить долг'}
          </button>
        </form>
      )}

      {debts === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
      {loadError && (
        <div className="py-7 text-center">
          <p className="text-sm text-[#D69A83]">{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-3 rounded-[9px] bg-lime px-4 py-2 text-xs font-bold text-lime-ink">
            Повторить
          </button>
        </div>
      )}
      {!loadError && debts?.length === 0 && <p className="py-8 text-center text-sm text-[#8A7F76]">Открытых долгов нет</p>}
      {(debts ?? []).map((debt) => (
        <article key={debt.id} className="mb-2.5 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">#{debt.id.slice(-6)}</span>
            <span className={`rounded-md px-2 py-0.5 text-[11px] ${new Date(debt.dueDate) < new Date() ? 'bg-warn/15 text-warn' : 'bg-lime/15 text-lime'}`}>
              до {debt.dueDate.slice(0, 10)}
            </span>
          </div>
          <div className="mt-1.5 text-[13px] text-[#A79C92]">
            заказ #{debt.orderId.slice(-6)} · {debt.installments} плат.
          </div>
          <div className="mt-1 font-display text-base font-extrabold">
            {som(debt.balance)} <span className="text-[11px] font-normal text-[#8A7F76]">из {som(debt.principal)}</span>
          </div>
          {canPayDebt(role) && debt.status === 'open' && (
            <div className="mt-3 flex gap-2">
              <input
                aria-label={`Сумма платежа по долгу ${debt.id.slice(-6)}`}
                type="number"
                value={payAmounts[debt.id] ?? ''}
                onChange={(event) => setPayAmounts((current) => ({ ...current, [debt.id]: event.target.value }))}
                className="min-w-0 flex-1 rounded-[9px] border border-[#2E2822] bg-[#16130F] px-3 py-2 font-mono text-xs outline-none focus:border-lime"
              />
              <button
                type="button"
                disabled={busy === debt.id || !Number(payAmounts[debt.id])}
                onClick={() => submitPay(debt)}
                className="rounded-[9px] bg-lime px-3 text-xs font-bold text-lime-ink disabled:opacity-50"
              >
                {busy === debt.id ? '…' : 'Принять платёж'}
              </button>
            </div>
          )}
        </article>
      ))}
    </>
  );
}

function DeskField({
  label,
  value,
  onChange,
  inputMode,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: 'numeric';
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="mb-2 grid grid-cols-[86px_1fr] items-center gap-2">
      <span className="text-[12px] font-semibold text-[#8A7F76]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        required={required}
        placeholder={placeholder}
        className="rounded-[10px] border border-[#2E2822] bg-[#16130F] px-3 py-2.5 text-[13px] text-white outline-none focus:border-lime"
      />
    </label>
  );
}
