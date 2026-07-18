'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { issueGiftCard, type IssuedGiftCard } from '@/lib/api';
import { som } from '@/lib/format';
import { canIssueGiftCard } from '@/lib/staff-permissions';

/**
 * Gift-card issue form for the staff app (giftcards,issue). The server generates
 * the code; the issued card is shown prominently so the cashier can hand the code
 * to the customer.
 */
export function GiftCardIssue({
  accessToken,
  role,
  flash,
}: {
  accessToken: string;
  role: string;
  flash: (message: string) => void;
}) {
  const [form, setForm] = useState({ amount: '', note: '' });
  const [issued, setIssued] = useState<IssuedGiftCard | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isInteger(amount) || amount < 1) {
      flash('Укажите номинал карты');
      return;
    }
    setBusy(true);
    try {
      const card = await issueGiftCard({
        amount,
        note: form.note.trim() || undefined,
      }, accessToken);
      setIssued(card);
      setForm({ amount: '', note: '' });
      flash('Карта выпущена');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка выпуска карты');
    } finally {
      setBusy(false);
    }
  }

  if (!canIssueGiftCard(role)) {
    return <p className="py-8 text-center text-sm text-[#8A7F76]">Нет права выпуска подарочных карт</p>;
  }

  return (
    <>
      <form onSubmit={submit} className="mb-4 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="mb-3 font-display text-[15px] font-bold">Выпустить подарочную карту</div>
        <label className="mb-2 grid grid-cols-[86px_1fr] items-center gap-2">
          <span className="text-[12px] font-semibold text-[#8A7F76]">Номинал</span>
          <input
            value={form.amount}
            onChange={(event) => setForm((f) => ({ ...f, amount: event.target.value }))}
            inputMode="numeric"
            required
            className="rounded-[10px] border border-[#2E2822] bg-[#16130F] px-3 py-2.5 text-[13px] text-white outline-none focus:border-lime"
          />
        </label>
        <label className="mb-2 grid grid-cols-[86px_1fr] items-center gap-2">
          <span className="text-[12px] font-semibold text-[#8A7F76]">Заметка</span>
          <input
            value={form.note}
            onChange={(event) => setForm((f) => ({ ...f, note: event.target.value }))}
            placeholder="Подарочная карта за возврат"
            className="rounded-[10px] border border-[#2E2822] bg-[#16130F] px-3 py-2.5 text-[13px] text-white outline-none focus:border-lime"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-2 w-full rounded-[11px] bg-lime py-3 text-center text-sm font-bold text-lime-ink disabled:opacity-60"
        >
          {busy ? '…' : 'Выпустить карту'}
        </button>
      </form>

      {issued && (
        <div className="rounded-[16px] border border-lime/20 bg-lime/10 p-4">
          <div className="text-[11px] font-semibold uppercase text-[#8A7F76]">Код карты — сообщите клиенту</div>
          <div className="mt-1.5 break-all font-mono text-lg font-bold text-lime">{issued.code}</div>
          <div className="mt-2 text-[13px] text-[#D8CFC6]">
            {som(issued.balance)} · {issued.status}
            {issued.expiresAt && <span> · до {issued.expiresAt.slice(0, 10)}</span>}
          </div>
        </div>
      )}
    </>
  );
}
