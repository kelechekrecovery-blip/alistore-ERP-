'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { approveExpense, createExpense, fetchExpenses, payExpense, rejectExpense, type Expense } from '@/lib/api';
import { som } from '@/lib/format';
import type { Dashboard } from '@/lib/reports';
import { Card } from './Card';

const CATEGORIES: Record<string, string> = {
  rent: 'Аренда', payroll: 'Зарплата', logistics: 'Логистика', marketing: 'Маркетинг',
  utilities: 'Коммунальные', procurement: 'Закупки', other: 'Прочее',
};
const STATUS: Record<string, string> = {
  submitted: 'На согласовании', approved: 'Согласовано', rejected: 'Отклонено', paid: 'Выплачено',
};

export function FinanceView({ d, accessToken }: { d: Dashboard | null; accessToken: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [point, setPoint] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const reload = useCallback(() => {
    fetchExpenses(accessToken).then(setExpenses).catch(() => setMessage('Не удалось загрузить расходы'));
  }, [accessToken]);

  useEffect(() => reload(), [reload]);

  async function run(id: string, action: () => Promise<Expense>) {
    setBusy(id);
    setMessage('');
    try {
      await action();
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Операция не выполнена');
    } finally {
      setBusy('');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Math.round(Number(amount));
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount < 1) return;
    setBusy('create');
    setMessage('');
    try {
      await createExpense({
        idempotencyKey: crypto.randomUUID(), category, description: description.trim(), amount: numericAmount,
        ...(point.trim() ? { point: point.trim() } : {}),
      }, accessToken);
      setDescription('');
      setAmount('');
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать расход');
    } finally {
      setBusy('');
    }
  }

  const rows = d ? [
    { label: 'Выручка', value: som(d.money.salesGross), color: '#fff' },
    { label: 'Возвраты', value: `-${som(d.money.refunds)}`, color: '#FF8A7A' },
    { label: 'Оплаченные расходы', value: `-${som(d.money.expenses)}`, color: '#FFB86B' },
    { label: 'Операционная прибыль', value: som(d.money.operatingProfit), color: '#C6FF3D' },
  ] : [];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.75fr)_minmax(560px,1.65fr)]">
      <div className="space-y-5">
        <Card>
          <div className="mb-4 font-display text-[15px] font-bold">P&amp;L</div>
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between border-b border-[#221E19] py-2.5 text-[13px]">
              <span style={{ color: row.color }}>{row.label}</span>
              <span className="font-mono tabular" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
          <div className="mb-2 mt-4 text-xs uppercase text-[#8A7F76]">По способам</div>
          {(d?.money.byMethod ?? []).map((method) => (
            <div key={method.method} className="flex justify-between py-1 text-[13px] text-[#D8CFC6]">
              <span>{method.method}</span><span className="font-mono tabular">{som(method.amount)}</span>
            </div>
          ))}
        </Card>
        <form onSubmit={submit} className="border-t border-[#2E2822] pt-5">
          <div className="mb-3 font-display text-sm font-bold">Новый расход</div>
          <div className="grid gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm">
              {Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Назначение" className="h-10 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Сумма, сом" className="h-10 min-w-0 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm" />
              <input value={point} onChange={(e) => setPoint(e.target.value)} maxLength={100} placeholder="Точка" className="h-10 min-w-0 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm" />
            </div>
            <button disabled={busy === 'create'} className="h-10 rounded-[6px] bg-[#C6FF3D] px-4 text-sm font-bold text-[#111] disabled:opacity-50">
              {busy === 'create' ? 'Создаём...' : 'Отправить на согласование'}
            </button>
          </div>
        </form>
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold">Расходы</h2><span className="text-xs text-[#8A7F76]">{expenses.length} заявок</span>
        </div>
        {message && <div className="mb-3 rounded-[6px] border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-[#FFB5AA]">{message}</div>}
        <div className="grid gap-2">
          {expenses.map((expense) => (
            <article key={expense.id} className="grid min-h-24 grid-cols-[1fr_auto] gap-4 rounded-[6px] border border-[#2E2822] bg-[#16130F] p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{expense.description}</strong><span className="rounded bg-[#29231E] px-2 py-0.5 text-[10px] text-[#B9ADA2]">{CATEGORIES[expense.category] ?? expense.category}</span></div>
                <div className="mt-2 text-xs text-[#8A7F76]">{STATUS[expense.status]}{expense.point ? ` · ${expense.point}` : ''}{expense.supplier ? ` · ${expense.supplier.name}` : ''}</div>
                {expense.rejectionNote && <div className="mt-2 text-xs text-[#FF8A7A]">{expense.rejectionNote}</div>}
              </div>
              <div className="flex min-w-32 flex-col items-end justify-between gap-3">
                <span className="font-mono text-sm font-bold tabular">{som(expense.amount)}</span>
                {expense.status === 'submitted' && <div className="flex gap-2">
                  <button disabled={busy === expense.id} onClick={() => run(expense.id, () => rejectExpense(expense.id, 'Отклонено владельцем', accessToken))} className="text-xs text-[#FF8A7A] disabled:opacity-50">Отклонить</button>
                  <button disabled={busy === expense.id} onClick={() => run(expense.id, () => approveExpense(expense.id, accessToken))} className="rounded-[5px] bg-[#29231E] px-3 py-1.5 text-xs font-semibold text-[#C6FF3D] disabled:opacity-50">Согласовать</button>
                </div>}
                {expense.status === 'approved' && <button disabled={busy === expense.id} onClick={() => run(expense.id, () => payExpense(expense.id, accessToken))} className="rounded-[5px] bg-[#C6FF3D] px-3 py-1.5 text-xs font-bold text-[#111] disabled:opacity-50">Выплатить</button>}
              </div>
            </article>
          ))}
          {!expenses.length && <div className="border-t border-[#2E2822] py-10 text-center text-sm text-[#8A7F76]">Расходов пока нет</div>}
        </div>
      </section>
    </div>
  );
}
