'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  approveExpense,
  createExpense,
  fetchAccountingAccounts,
  fetchExpenses,
  fetchFinancePlanFact,
  fetchTrialBalance,
  payExpense,
  rejectExpense,
  setFinanceBudget,
  type Expense,
  type AccountingAccount,
  type FinancePlanFact,
  type TrialBalance,
} from '@/lib/api';
import { som } from '@/lib/format';
import type { Dashboard } from '@/lib/reports';
import { Card } from './Card';
import { FinanceSettlementWorkspace } from './FinanceSettlementWorkspace';
import { FinanceControlsPanel } from './FinanceControlsPanel';

const CATEGORIES: Record<string, string> = {
  rent: 'Аренда', payroll: 'Зарплата', logistics: 'Логистика', marketing: 'Маркетинг',
  utilities: 'Коммунальные', procurement: 'Закупки', other: 'Прочее',
};
const STATUS: Record<string, string> = {
  submitted: 'На согласовании', approved: 'Согласовано', rejected: 'Отклонено', paid: 'Выплачено',
};
const CURRENT_PERIOD = new Date().toISOString().slice(0, 7);
const paymentStorageKey = (expenseId: string) => `alistore:finance:expense-payment:${expenseId}`;

export function FinanceView({ d, accessToken }: { d: Dashboard | null; accessToken: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [point, setPoint] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [period, setPeriod] = useState(CURRENT_PERIOD);
  const [planPoint, setPlanPoint] = useState('');
  const [planFact, setPlanFact] = useState<FinancePlanFact | null>(null);
  const [budgetCategory, setBudgetCategory] = useState('rent');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [planningBusy, setPlanningBusy] = useState(false);
  const [planningMessage, setPlanningMessage] = useState('');
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [accountingState, setAccountingState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fundingByExpense, setFundingByExpense] = useState<Record<string, string>>({});
  const [referenceByExpense, setReferenceByExpense] = useState<Record<string, string>>({});
  const [paymentKeyByExpense, setPaymentKeyByExpense] = useState<Record<string, string>>({});
  const reload = useCallback(() => {
    fetchExpenses(accessToken).then(setExpenses).catch(() => setMessage('Не удалось загрузить расходы'));
  }, [accessToken]);

  useEffect(() => reload(), [reload]);

  useEffect(() => {
    const paidIds = new Set(expenses.filter((expense) => expense.status === 'paid').map((expense) => expense.id));
    if (!paidIds.size) return;
    paidIds.forEach((id) => localStorage.removeItem(paymentStorageKey(id)));
    setPaymentKeyByExpense((current) => {
      if (!Object.keys(current).some((id) => paidIds.has(id))) return current;
      return Object.fromEntries(Object.entries(current).filter(([id]) => !paidIds.has(id)));
    });
  }, [expenses]);

  useEffect(() => {
    fetchAccountingAccounts(accessToken).then(setAccounts).catch(() => setMessage('Не удалось загрузить план счетов'));
  }, [accessToken]);

  const reloadPlanning = useCallback(() => {
    setPlanningMessage('');
    setAccountingState('loading');
    Promise.all([
      fetchFinancePlanFact(period, planPoint, accessToken),
      fetchTrialBalance(period, planPoint, accessToken),
    ])
      .then(([planning, balance]) => { setPlanFact(planning); setTrialBalance(balance); setAccountingState('ready'); })
      .catch(() => {
        setPlanFact(null);
        setTrialBalance(null);
        setAccountingState('error');
        setPlanningMessage('Не удалось загрузить план-факт');
      });
  }, [accessToken, period, planPoint]);

  useEffect(() => reloadPlanning(), [reloadPlanning]);

  async function run(id: string, action: () => Promise<Expense>) {
    setBusy(id);
    setMessage('');
    try {
      await action();
      reload();
      reloadPlanning();
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

  async function submitBudget(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Math.round(Number(budgetAmount));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !Number.isFinite(numericAmount) || numericAmount < 1) return;
    setPlanningBusy(true);
    setPlanningMessage('');
    try {
      await setFinanceBudget({
        period,
        category: budgetCategory,
        amount: numericAmount,
        ...(planPoint.trim() ? { point: planPoint.trim() } : {}),
      }, accessToken);
      setBudgetAmount('');
      reloadPlanning();
    } catch (error) {
      setPlanningMessage(error instanceof Error ? error.message : 'Не удалось сохранить бюджет');
    } finally {
      setPlanningBusy(false);
    }
  }

  const rows = d ? [
    { label: 'Выручка', value: som(d.money.salesGross), color: '#fff' },
    { label: 'Возвраты', value: `-${som(d.money.refunds)}`, color: '#FF8A7A' },
    { label: 'Оплаченные расходы', value: `-${som(d.money.expenses)}`, color: '#FFB86B' },
    { label: 'Операционная прибыль', value: som(d.money.operatingProfit), color: '#C6FF3D' },
  ] : [];

  return (
    <div className="space-y-5">
      <FinanceSettlementWorkspace accessToken={accessToken} />
      <FinanceControlsPanel accessToken={accessToken} />
      <section aria-labelledby="trial-balance-title" className="border-b border-[#2E2822] pb-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="trial-balance-title" className="font-display text-[15px] font-bold">Оборотно-сальдовая ведомость</h2><p className="mt-1 text-xs text-[#8A7F76]">{trialBalance?.coverage.note ?? 'Загружаем проводки операционных расходов'}</p></div>
          <span data-testid="trial-balance-status" className={`rounded-[5px] px-2.5 py-1 text-xs font-semibold ${accountingState === 'ready' && trialBalance?.balanced ? 'bg-[#26351B] text-[#C6FF3D]' : accountingState === 'error' || accountingState === 'ready' ? 'bg-[#593127] text-[#FFB5AA]' : 'bg-[#29231E] text-[#B9ADA2]'}`}>{accountingState === 'loading' ? 'Загрузка' : accountingState === 'error' ? 'Данные недоступны' : trialBalance?.balanced ? 'Дебет = кредит' : 'Баланс не сошёлся'}</span>
        </div>
        <div className="overflow-x-auto rounded-[7px] border border-[#2E2822] bg-[#16130F]">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="bg-[#1D1915] text-[#8A7F76]"><tr><th className="px-4 py-2.5">Счёт</th><th className="px-4 py-2.5">Наименование</th><th className="px-4 py-2.5 text-right">Дебет</th><th className="px-4 py-2.5 text-right">Кредит</th><th className="px-4 py-2.5 text-right">Сальдо</th></tr></thead>
            <tbody>{(trialBalance?.rows ?? []).filter((row) => row.debit || row.credit).map((row) => <tr key={row.code} className="border-t border-[#2E2822]"><td className="px-4 py-2.5 font-mono text-[#C6FF3D]">{row.code}</td><td className="px-4 py-2.5 text-[#D8CFC6]">{row.name}</td><td className="px-4 py-2.5 text-right font-mono">{som(row.debit)}</td><td className="px-4 py-2.5 text-right font-mono">{som(row.credit)}</td><td className="px-4 py-2.5 text-right font-mono">{som(row.balance)}</td></tr>)}</tbody>
            <tfoot><tr className="border-t border-[#3A332C] font-bold"><td className="px-4 py-3" colSpan={2}>Обороты</td><td className="px-4 py-3 text-right font-mono">{som(trialBalance?.totalDebit ?? 0)}</td><td className="px-4 py-3 text-right font-mono">{som(trialBalance?.totalCredit ?? 0)}</td><td /></tr></tfoot>
          </table>
          {!(trialBalance?.rows ?? []).some((row) => row.debit || row.credit) && <div className="border-t border-[#2E2822] px-4 py-8 text-center text-sm text-[#8A7F76]">Проводок за период пока нет</div>}
        </div>
      </section>
      <section aria-labelledby="finance-plan-title" className="border-b border-[#2E2822] pb-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="finance-plan-title" className="font-display text-[15px] font-bold">Бюджет и план-факт</h2>
            <p className="mt-1 text-xs text-[#8A7F76]">Факт включает только выплаченные расходы выбранного периода</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="text-[11px] text-[#8A7F76]">Период
              <input aria-label="Период бюджета" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-xs text-white" />
            </label>
            <label className="text-[11px] text-[#8A7F76]">Точка
              <input aria-label="Точка бюджета" value={planPoint} onChange={(event) => setPlanPoint(event.target.value)} maxLength={100} placeholder="Все точки" className="mt-1 block h-9 w-36 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-xs text-white" />
            </label>
          </div>
        </div>
        {planningMessage && <div className="mb-3 rounded-[6px] border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-[#FFB5AA]">{planningMessage}</div>}
        <div className="grid gap-3 md:grid-cols-3">
          <div data-testid="finance-plan" className="rounded-[7px] border border-[#2E2822] bg-[#16130F] p-4"><div className="text-xs text-[#8A7F76]">План</div><strong className="mt-1 block font-mono text-xl text-white">{som(planFact?.plan ?? 0)}</strong></div>
          <div data-testid="finance-actual" className="rounded-[7px] border border-[#2E2822] bg-[#16130F] p-4"><div className="text-xs text-[#8A7F76]">Факт</div><strong className="mt-1 block font-mono text-xl text-[#FFB86B]">{som(planFact?.actual ?? 0)}</strong></div>
          <div className="rounded-[7px] border border-[#2E2822] bg-[#16130F] p-4"><div className="text-xs text-[#8A7F76]">Остаток</div><strong className={`mt-1 block font-mono text-xl ${(planFact?.variance ?? 0) < 0 ? 'text-[#FF8A7A]' : 'text-[#C6FF3D]'}`}>{som(planFact?.variance ?? 0)}</strong></div>
        </div>
        <div className="mt-3 overflow-hidden rounded-[7px] border border-[#2E2822] bg-[#16130F]">
          {(planFact?.rows ?? []).map((row) => (
            <div key={row.category} data-testid={`finance-row-${row.category}`} className="grid grid-cols-[minmax(100px,1fr)_80px_80px] items-center gap-3 border-b border-[#221E19] px-4 py-3 text-xs last:border-b-0 md:grid-cols-[minmax(140px,1fr)_120px_120px_120px]">
              <div className="min-w-0">
                <div className="font-semibold text-[#E5DCD3]">{CATEGORIES[row.category] ?? row.category}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#2E2822]"><div className={`h-full rounded-full ${(row.usagePct ?? 0) > 100 ? 'bg-[#FF8A7A]' : 'bg-[#C6FF3D]'}`} style={{ width: `${Math.min(row.usagePct ?? 0, 100)}%` }} /></div>
              </div>
              <span className="font-mono text-[#A79C92]">{som(row.plan)}</span>
              <span className="font-mono text-[#FFB86B]">{som(row.actual)}</span>
              <span className={`hidden font-mono md:block ${row.variance < 0 ? 'text-[#FF8A7A]' : 'text-[#7FD3A0]'}`}>{row.usagePct === null ? 'без плана' : `${row.usagePct}%`}</span>
            </div>
          ))}
        </div>
        <form onSubmit={submitBudget} className="mt-3 grid gap-2 sm:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto]">
          <select aria-label="Категория бюджета" value={budgetCategory} onChange={(event) => setBudgetCategory(event.target.value)} className="h-10 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm">
            {Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input aria-label="Сумма бюджета" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} inputMode="numeric" placeholder="Бюджет, сом" className="h-10 min-w-0 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm" />
          <button disabled={planningBusy} className="h-10 rounded-[6px] bg-[#C6FF3D] px-4 text-sm font-bold text-[#111] disabled:opacity-50">{planningBusy ? 'Сохраняем...' : 'Установить бюджет'}</button>
        </form>
      </section>
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
            <select aria-label="Категория расхода" value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm">
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
                {expense.status === 'approved' && <div className="grid w-52 gap-2">
                  <select aria-label={`Источник выплаты ${expense.description}`} value={fundingByExpense[expense.id] ?? '1000'} onChange={(event) => setFundingByExpense((current) => ({ ...current, [expense.id]: event.target.value }))} className="h-8 rounded-[5px] border border-[#3A332C] bg-[#1A1611] px-2 text-xs">
                    {accounts.filter((account) => ['1000', '1010', '1020'].includes(account.code)).map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}
                  </select>
                  <input aria-label={`Платёжный референс ${expense.description}`} value={referenceByExpense[expense.id] ?? ''} onChange={(event) => setReferenceByExpense((current) => ({ ...current, [expense.id]: event.target.value }))} maxLength={128} placeholder="Номер документа" className="h-8 rounded-[5px] border border-[#3A332C] bg-[#1A1611] px-2 text-xs" />
                  <button disabled={busy === expense.id} onClick={() => {
                    const storageKey = paymentStorageKey(expense.id);
                    const idempotencyKey = paymentKeyByExpense[expense.id] ?? localStorage.getItem(storageKey) ?? crypto.randomUUID();
                    localStorage.setItem(storageKey, idempotencyKey);
                    setPaymentKeyByExpense((current) => ({ ...current, [expense.id]: idempotencyKey }));
                    void run(expense.id, async () => {
                      const result = await payExpense(expense.id, fundingByExpense[expense.id] ?? '1000', referenceByExpense[expense.id] ?? '', idempotencyKey, accessToken);
                      localStorage.removeItem(storageKey);
                      setPaymentKeyByExpense((current) => {
                        const next = { ...current };
                        delete next[expense.id];
                        return next;
                      });
                      return result;
                    });
                  }} className="rounded-[5px] bg-[#C6FF3D] px-3 py-1.5 text-xs font-bold text-[#111] disabled:opacity-50">Провести выплату</button>
                </div>}
                {expense.status === 'paid' && <div className="text-right text-[11px] text-[#8A7F76]"><span className="font-mono text-[#C6FF3D]">{expense.paymentAccountCode}</span>{expense.paymentReference ? <span className="mt-1 block">{expense.paymentReference}</span> : null}</div>}
              </div>
            </article>
          ))}
          {!expenses.length && <div className="border-t border-[#2E2822] py-10 text-center text-sm text-[#8A7F76]">Расходов пока нет</div>}
        </div>
      </section>
      </div>
    </div>
  );
}
