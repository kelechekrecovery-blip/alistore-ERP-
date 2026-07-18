'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  approveExpense,
  createAccountingCurrencyRate,
  createExpense,
  fetchAccountingAccounts,
  fetchAccountingCurrencyRates,
  fetchExpenses,
  fetchFxExposure,
  fetchFinancePlanFact,
  fetchTrialBalance,
  payExpense,
  rejectExpense,
  setFinanceBudget,
  type Expense,
  type AccountingAccount,
  type AccountingCurrencyRate,
  type FxExposureReport,
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
  const [financeSection, setFinanceSection] = useState<'overview' | 'cash' | 'payroll' | 'suppliers' | 'expenses' | 'currency'>('overview');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('KGS');
  const [exchangeRateId, setExchangeRateId] = useState('');
  const [taxMode, setTaxMode] = useState<'none' | 'included' | 'excluded'>('none');
  const [taxRatePercent, setTaxRatePercent] = useState('0');
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
  const [currencyRates, setCurrencyRates] = useState<AccountingCurrencyRate[]>([]);
  const [fxExposure, setFxExposure] = useState<FxExposureReport | null>(null);
  const [rateCurrency, setRateCurrency] = useState('USD');
  const [rateValue, setRateValue] = useState('');
  const [rateDate, setRateDate] = useState(new Date().toISOString().slice(0, 10));
  const [rateSource, setRateSource] = useState('НБКР');
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

  const reloadCurrencyRates = useCallback(() => {
    fetchAccountingCurrencyRates(accessToken).then(setCurrencyRates).catch(() => setMessage('Не удалось загрузить курсы валют'));
  }, [accessToken]);

  useEffect(() => reloadCurrencyRates(), [reloadCurrencyRates]);

  const reloadFxExposure = useCallback(() => {
    fetchFxExposure(new Date().toISOString(), '', planPoint, accessToken)
      .then(setFxExposure)
      .catch(() => setFxExposure(null));
  }, [accessToken, planPoint]);

  useEffect(() => reloadFxExposure(), [reloadFxExposure]);

  useEffect(() => {
    if (currency === 'KGS') {
      setExchangeRateId('');
      return;
    }
    const matching = currencyRates.filter((rate) => rate.currency === currency);
    if (!matching.some((rate) => rate.id === exchangeRateId)) setExchangeRateId(matching[0]?.id ?? '');
  }, [currency, currencyRates, exchangeRateId]);

  useEffect(() => {
    if (taxMode === 'none') setTaxRatePercent('0');
  }, [taxMode]);

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
      reloadFxExposure();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Операция не выполнена');
    } finally {
      setBusy('');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Math.round(Number(amount));
    const numericTaxRateBps = Math.round(Number(taxRatePercent) * 100);
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount < 1 || (currency !== 'KGS' && !exchangeRateId) || !Number.isInteger(numericTaxRateBps) || numericTaxRateBps < 0 || numericTaxRateBps > 10_000 || (taxMode === 'none' ? numericTaxRateBps !== 0 : numericTaxRateBps === 0)) return;
    setBusy('create');
    setMessage('');
    try {
      await createExpense({
        idempotencyKey: crypto.randomUUID(), category, description: description.trim(), amount: numericAmount,
        currency,
        ...(currency !== 'KGS' && exchangeRateId ? { exchangeRateId } : {}),
        taxMode,
        taxRateBps: numericTaxRateBps,
        ...(point.trim() ? { point: point.trim() } : {}),
      }, accessToken);
      setDescription('');
      setAmount('');
      reload();
      reloadFxExposure();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать расход');
    } finally {
      setBusy('');
    }
  }

  async function submitCurrencyRate(event: FormEvent) {
    event.preventDefault();
    const rateMicros = Math.round(Number(rateValue) * 1_000_000);
    if (!/^[A-Z]{3}$/.test(rateCurrency) || rateCurrency === 'KGS' || !Number.isSafeInteger(rateMicros) || rateMicros < 1 || !rateSource.trim()) return;
    setBusy('currency-rate');
    setMessage('');
    try {
      const created = await createAccountingCurrencyRate({
        currency: rateCurrency,
        rateMicros,
        effectiveAt: new Date(`${rateDate}T00:00:00.000Z`).toISOString(),
        source: rateSource.trim(),
      }, accessToken);
      setCurrency(created.currency);
      setExchangeRateId(created.id);
      setRateValue('');
      reloadCurrencyRates();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось зарегистрировать курс');
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
  const currencies = ['KGS', ...new Set(currencyRates.map((rate) => rate.currency))];
  const matchingRates = currencyRates.filter((rate) => rate.currency === currency);

  const pnlRows = d ? [
    { label: 'Выручка', value: d.money.salesGross, color: '#fff' },
    { label: 'Себестоимость товаров', value: -(d.money.salesGross - d.money.operatingProfit - d.money.expenses), color: '#FF8A7A' },
    { label: 'Валовая прибыль', value: d.money.operatingProfit + d.money.expenses, color: '#C6FF3D' },
    { label: 'Операционные расходы', value: -d.money.expenses, color: '#FF8A7A' },
    { label: 'Чистая прибыль', value: d.money.operatingProfit, color: '#C6FF3D' },
  ] : [
    { label: 'Выручка', value: 8_420_000, color: '#fff' },
    { label: 'Себестоимость товаров', value: -6_100_000, color: '#FF8A7A' },
    { label: 'Валовая прибыль', value: 2_320_000, color: '#C6FF3D' },
    { label: 'Операционные расходы', value: -1_180_000, color: '#FF8A7A' },
    { label: 'Чистая прибыль', value: 1_140_000, color: '#C6FF3D' },
  ];
  const kpiCards = [
    { label: 'Выручка', value: d ? som(d.money.salesGross) : '8.42 млн', color: '#fff' },
    { label: 'Себестоимость', value: d ? som(Math.abs(pnlRows[1].value)) : '6.10 млн', color: '#fff' },
    { label: 'Валовая', value: d ? som(pnlRows[2].value) : '2.32 млн', color: '#C6FF3D' },
    { label: 'Чистая', value: d ? som(d.money.operatingProfit) : '1.14 млн', color: '#FF8A5F' },
  ];
  const financeTabs = [
    { id: 'overview' as const, label: 'Обзор' },
    { id: 'cash' as const, label: 'Касса' },
    { id: 'payroll' as const, label: 'Зарплата' },
    { id: 'suppliers' as const, label: 'Поставщики' },
    { id: 'expenses' as const, label: 'Расходы' },
    { id: 'currency' as const, label: 'Валюты' },
  ];
  const cashAmount = d?.money.byMethod.find((method) => method.method.toLowerCase().includes('cash') || method.method.toLowerCase().includes('нал'))?.amount ?? 0;
  const selectFinanceSection = (section: typeof financeSection) => {
    setFinanceSection(section);
    const target = document.getElementById(`finance-${section}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function exportPnlXls() {
    const csv = ['Статья;Сумма', ...pnlRows.map((r) => `${r.label};${r.value}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pnl-erp-2.0.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-surface-3 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · Finance 3.0</div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Финансы</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-subtle">Касса, выплаты, поставщики и контроль денег в одном рабочем пространстве.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-subtle"><span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_12px_rgba(198,255,61,0.65)]" /> Данные синхронизированы</div>
      </header>
      <nav aria-label="Разделы финансов" className="flex gap-1 overflow-x-auto border-b border-surface-3 pb-px">
        {financeTabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => selectFinanceSection(tab.id)} className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold transition ${financeSection === tab.id ? 'border-[#FF5B2E] text-white' : 'border-transparent text-subtle hover:text-bright'}`}>
            {tab.label}
          </button>
        ))}
      </nav>
      <section id="finance-cash" aria-label="Касса" className="scroll-mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'В кассе сейчас', value: cashAmount ? som(cashAmount) : '—', tone: 'text-white' },
          { label: 'Лимит кассы', value: '—', tone: 'text-white' },
          { label: 'К инкассации', value: '—', tone: 'text-[#FF7A4D]' },
          { label: 'Открытые заявки', value: `${expenses.filter((expense) => expense.status !== 'paid' && expense.status !== 'rejected').length}`, tone: 'text-lime' },
        ].map((item) => (
          <div key={item.label} className="rounded-[14px] border border-surface-3 bg-surface p-3.5">
            <div className="text-[11px] text-subtle">{item.label}</div>
            <div className={`mt-2 font-display text-xl font-extrabold tabular ${item.tone}`}>{item.value}</div>
          </div>
        ))}
      </section>
      <section id="finance-overview" aria-label="Финансовый обзор" className="scroll-mt-6">
      {/* Finance 3.0 overview */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="rounded-[16px] border border-surface-3 bg-surface p-4">
            <div className="text-xs text-subtle">{k.label}</div>
            <div className="mt-1.5 font-display text-[22px] font-extrabold tabular" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <Card>
        <div className="mb-3.5 flex items-center justify-between">
          <div className="font-display text-[15px] font-bold text-white">Отчёт P&amp;L</div>
          <button
            type="button"
            onClick={exportPnlXls}
            className="rounded-[9px] bg-[#1F3D2E] px-3.5 py-2 text-xs font-semibold text-lime transition hover:brightness-110"
          >
            ↓ Excel
          </button>
        </div>
        {pnlRows.map((row) => (
          <div key={row.label} className="flex justify-between border-b border-surface-2 py-2.5 text-[13px] last:border-0">
            <span style={{ color: row.color }}>{row.label}</span>
            <span className="font-mono tabular" style={{ color: row.color }}>{som(row.value)}</span>
          </div>
        ))}
      </Card>
      </section>

      <div id="finance-suppliers" className="scroll-mt-6">
        <FinanceSettlementWorkspace accessToken={accessToken} />
      </div>
      <FinanceControlsPanel accessToken={accessToken} />
      <section aria-labelledby="trial-balance-title" className="border-b border-surface-3 pb-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="trial-balance-title" className="font-display text-[15px] font-bold">Оборотно-сальдовая ведомость</h2><p className="mt-1 text-xs text-subtle">{trialBalance?.coverage.note ?? 'Загружаем проводки расходов, продаж и возвратов'}</p></div>
          <span data-testid="trial-balance-status" className={`rounded-[5px] px-2.5 py-1 text-xs font-semibold ${accountingState === 'ready' && trialBalance?.balanced ? 'bg-[#26351B] text-lime' : accountingState === 'error' || accountingState === 'ready' ? 'bg-[#593127] text-coral-tint' : 'bg-surface-3 text-[#B9ADA2]'}`}>{accountingState === 'loading' ? 'Загрузка' : accountingState === 'error' ? 'Данные недоступны' : trialBalance?.balanced ? 'Дебет = кредит' : 'Баланс не сошёлся'}</span>
        </div>
        <div className="overflow-x-auto rounded-[7px] border border-surface-3 bg-ink-dark">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="bg-ink text-subtle"><tr><th className="px-4 py-2.5">Счёт</th><th className="px-4 py-2.5">Наименование</th><th className="px-4 py-2.5 text-right">Дебет</th><th className="px-4 py-2.5 text-right">Кредит</th><th className="px-4 py-2.5 text-right">Сальдо</th></tr></thead>
            <tbody>{(trialBalance?.rows ?? []).filter((row) => row.debit || row.credit).map((row) => <tr key={row.code} className="border-t border-surface-3"><td className="px-4 py-2.5 font-mono text-lime">{row.code}</td><td className="px-4 py-2.5 text-bright">{row.name}</td><td className="px-4 py-2.5 text-right font-mono">{som(row.debit)}</td><td className="px-4 py-2.5 text-right font-mono">{som(row.credit)}</td><td className="px-4 py-2.5 text-right font-mono">{som(row.balance)}</td></tr>)}</tbody>
            <tfoot><tr className="border-t border-line font-bold"><td className="px-4 py-3" colSpan={2}>Обороты</td><td className="px-4 py-3 text-right font-mono">{som(trialBalance?.totalDebit ?? 0)}</td><td className="px-4 py-3 text-right font-mono">{som(trialBalance?.totalCredit ?? 0)}</td><td /></tr></tfoot>
          </table>
          {!(trialBalance?.rows ?? []).some((row) => row.debit || row.credit) && <div className="border-t border-surface-3 px-4 py-8 text-center text-sm text-subtle">Проводок за период пока нет</div>}
        </div>
      </section>
      <section id="finance-payroll" aria-labelledby="finance-plan-title" className="scroll-mt-6 border-b border-surface-3 pb-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="finance-plan-title" className="font-display text-[15px] font-bold">Бюджет и план-факт</h2>
            <p className="mt-1 text-xs text-subtle">Факт включает только выплаченные расходы выбранного периода</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="text-[11px] text-subtle">Период
              <input aria-label="Период бюджета" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-line bg-surface px-3 text-xs text-white" />
            </label>
            <label className="text-[11px] text-subtle">Точка
              <input aria-label="Точка бюджета" value={planPoint} onChange={(event) => setPlanPoint(event.target.value)} maxLength={100} placeholder="Все точки" className="mt-1 block h-9 w-36 rounded-[6px] border border-line bg-surface px-3 text-xs text-white" />
            </label>
          </div>
        </div>
        {planningMessage && <div className="mb-3 rounded-[6px] border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-coral-tint">{planningMessage}</div>}
        <div className="grid gap-3 md:grid-cols-3">
          <div data-testid="finance-plan" className="rounded-[7px] border border-surface-3 bg-ink-dark p-4"><div className="text-xs text-subtle">План</div><strong className="mt-1 block font-mono text-xl text-white">{som(planFact?.plan ?? 0)}</strong></div>
          <div data-testid="finance-actual" className="rounded-[7px] border border-surface-3 bg-ink-dark p-4"><div className="text-xs text-subtle">Факт</div><strong className="mt-1 block font-mono text-xl text-[#FFB86B]">{som(planFact?.actual ?? 0)}</strong></div>
          <div className="rounded-[7px] border border-surface-3 bg-ink-dark p-4"><div className="text-xs text-subtle">Остаток</div><strong className={`mt-1 block font-mono text-xl ${(planFact?.variance ?? 0) < 0 ? 'text-danger-soft' : 'text-lime'}`}>{som(planFact?.variance ?? 0)}</strong></div>
        </div>
        <div className="mt-3 overflow-hidden rounded-[7px] border border-surface-3 bg-ink-dark">
          {(planFact?.rows ?? []).map((row) => (
            <div key={row.category} data-testid={`finance-row-${row.category}`} className="grid grid-cols-[minmax(100px,1fr)_80px_80px] items-center gap-3 border-b border-surface-2 px-4 py-3 text-xs last:border-b-0 md:grid-cols-[minmax(140px,1fr)_120px_120px_120px]">
              <div className="min-w-0">
                <div className="font-semibold text-[#E5DCD3]">{CATEGORIES[row.category] ?? row.category}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={`h-full rounded-full ${(row.usagePct ?? 0) > 100 ? 'bg-danger-soft' : 'bg-lime'}`} style={{ width: `${Math.min(row.usagePct ?? 0, 100)}%` }} /></div>
              </div>
              <span className="font-mono text-muted">{som(row.plan)}</span>
              <span className="font-mono text-[#FFB86B]">{som(row.actual)}</span>
              <span className={`hidden font-mono md:block ${row.variance < 0 ? 'text-danger-soft' : 'text-success-soft'}`}>{row.usagePct === null ? 'без плана' : `${row.usagePct}%`}</span>
            </div>
          ))}
        </div>
        <form onSubmit={submitBudget} className="mt-3 grid gap-2 sm:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto]">
          <select aria-label="Категория бюджета" value={budgetCategory} onChange={(event) => setBudgetCategory(event.target.value)} className="h-10 rounded-[6px] border border-line bg-surface px-3 text-sm">
            {Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input aria-label="Сумма бюджета" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} inputMode="numeric" placeholder="Бюджет, сом" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" />
          <button disabled={planningBusy} className="h-10 rounded-[6px] bg-lime px-4 text-sm font-bold text-coal disabled:opacity-50">{planningBusy ? 'Сохраняем...' : 'Установить бюджет'}</button>
        </form>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.75fr)_minmax(560px,1.65fr)]">
      <div className="space-y-5">
        <Card>
          <div className="mb-4 font-display text-[15px] font-bold">P&amp;L</div>
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between border-b border-surface-2 py-2.5 text-[13px]">
              <span style={{ color: row.color }}>{row.label}</span>
              <span className="font-mono tabular" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
          <div className="mb-2 mt-4 text-xs uppercase text-subtle">По способам</div>
          {(d?.money.byMethod ?? []).map((method) => (
            <div key={method.method} className="flex justify-between py-1 text-[13px] text-bright">
              <span>{method.method}</span><span className="font-mono tabular">{som(method.amount)}</span>
            </div>
          ))}
        </Card>
        <form id="finance-currency" onSubmit={submitCurrencyRate} className="scroll-mt-6 border-t border-surface-3 pt-5">
          <div className="mb-1 font-display text-sm font-bold">Курсы валют</div>
          <p className="mb-3 text-xs leading-5 text-subtle">Фиксируется курс к KGS на дату первичного документа.</p>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Валюта курса" value={rateCurrency} onChange={(event) => setRateCurrency(event.target.value.toUpperCase())} maxLength={3} placeholder="USD" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm uppercase" />
            <input aria-label="Курс к KGS" value={rateValue} onChange={(event) => setRateValue(event.target.value)} inputMode="decimal" placeholder="87.50 KGS" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" />
            <input aria-label="Дата курса" type="date" value={rateDate} onChange={(event) => setRateDate(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" />
            <input aria-label="Источник курса" value={rateSource} onChange={(event) => setRateSource(event.target.value)} maxLength={128} placeholder="НБКР" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" />
          </div>
          <button disabled={busy === 'currency-rate'} className="mt-2 h-10 w-full rounded-[6px] border border-line bg-surface-2 px-4 text-sm font-semibold text-lime disabled:opacity-50">{busy === 'currency-rate' ? 'Фиксируем...' : 'Зарегистрировать курс'}</button>
          <div className="mt-3 grid gap-1">
            {currencyRates.slice(0, 4).map((rate) => <div key={rate.id} className="flex justify-between text-[11px] text-subtle"><span>{rate.currency} · {new Date(rate.effectiveAt).toLocaleDateString('ru-RU')}</span><span className="font-mono text-bright">{(rate.rateMicros / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 6 })} KGS</span></div>)}
            {!currencyRates.length && <span className="text-[11px] text-faint">Иностранные курсы ещё не зарегистрированы</span>}
          </div>
        </form>
        <section aria-labelledby="fx-exposure-title" className="border-t border-surface-3 pt-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="font-display text-sm font-bold" id="fx-exposure-title">Открытая валютная экспозиция</div>
            <span className="text-[10px] text-subtle">на сегодня</span>
          </div>
          <p className="mb-3 text-xs leading-5 text-subtle">Только незакрытые расходы. Разница расчётная, проводка не создаётся.</p>
          <div className="grid gap-2">
            {(fxExposure?.totals ?? []).map((total) => (
              <div key={total.currency} className="rounded-[6px] border border-surface-3 bg-ink-dark p-3">
                <div className="flex items-center justify-between text-xs"><strong className="text-bright">{total.currency}</strong><span className="text-subtle">{total.openDocuments} док.</span></div>
                <div className="mt-2 flex justify-between text-[11px] text-subtle"><span>По документам</span><span className="font-mono text-bright">{som(total.originalBaseAmount)}</span></div>
                <div className="mt-1 flex justify-between text-[11px] text-subtle"><span>По текущему курсу</span><span className="font-mono text-[#FFB86B]">{total.missingRateDocuments || total.overflowDocuments ? 'нет полной оценки' : som(total.currentBaseAmount)}</span></div>
                {!total.missingRateDocuments && !total.overflowDocuments && <div className={`mt-1 flex justify-between text-[11px] ${total.valuationDelta > 0 ? 'text-danger-soft' : 'text-success-soft'}`}><span>Расчётная разница</span><span className="font-mono">{total.valuationDelta > 0 ? '+' : ''}{som(total.valuationDelta)}</span></div>}
                {(total.missingRateDocuments > 0 || total.overflowDocuments > 0) && <div className="mt-2 text-[10px] text-coral-tint">{total.missingRateDocuments ? `${total.missingRateDocuments} без курса` : ''}{total.missingRateDocuments && total.overflowDocuments ? ' · ' : ''}{total.overflowDocuments ? `${total.overflowDocuments} вне диапазона` : ''}</div>}
              </div>
            ))}
            {!fxExposure?.totals.length && <span className="text-[11px] text-faint">Открытых расходов в иностранной валюте нет</span>}
          </div>
        </section>
        <form onSubmit={submit} className="border-t border-surface-3 pt-5">
          <div className="mb-3 font-display text-sm font-bold">Новый расход</div>
          <div className="grid gap-2">
            <select aria-label="Категория расхода" value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-[6px] border border-line bg-surface px-3 text-sm">
              {Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Назначение" className="h-10 rounded-[6px] border border-line bg-surface px-3 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="Сумма расхода" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder={`Сумма, ${currency}`} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" />
              <select aria-label="Валюта расхода" value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm">
                {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            {currency !== 'KGS' && <select aria-label="Курс расхода" required value={exchangeRateId} onChange={(event) => setExchangeRateId(event.target.value)} className="h-10 rounded-[6px] border border-line bg-surface px-3 text-sm">
              <option value="">Выберите зафиксированный курс</option>
              {matchingRates.map((rate) => <option key={rate.id} value={rate.id}>{new Date(rate.effectiveAt).toLocaleDateString('ru-RU')} · {(rate.rateMicros / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 6 })} KGS · {rate.source}</option>)}
            </select>}
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Налоговый режим" value={taxMode} onChange={(event) => setTaxMode(event.target.value as 'none' | 'included' | 'excluded')} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm">
                <option value="none">Без налога</option>
                <option value="included">Налог включён</option>
                <option value="excluded">Налог сверху</option>
              </select>
              <input aria-label="Ставка налога" disabled={taxMode === 'none'} value={taxRatePercent} onChange={(event) => setTaxRatePercent(event.target.value)} inputMode="decimal" placeholder="Ставка, %" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm disabled:opacity-50" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={point} onChange={(e) => setPoint(e.target.value)} maxLength={100} placeholder="Точка" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" />
              <div className="flex h-10 items-center rounded-[6px] border border-surface-3 bg-ink-dark px-3 text-xs text-subtle">Проводка в KGS</div>
            </div>
            <button disabled={busy === 'create'} className="h-10 rounded-[6px] bg-lime px-4 text-sm font-bold text-coal disabled:opacity-50">
              {busy === 'create' ? 'Создаём...' : 'Отправить на согласование'}
            </button>
          </div>
        </form>
      </div>
      <section id="finance-expenses" className="scroll-mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold">Расходы</h2><span className="text-xs text-subtle">{expenses.length} заявок</span>
        </div>
        {message && <div className="mb-3 rounded-[6px] border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-coral-tint">{message}</div>}
        <div className="grid gap-2">
          {expenses.map((expense) => (
            <article key={expense.id} className="grid min-h-24 grid-cols-[1fr_auto] gap-4 rounded-[6px] border border-surface-3 bg-ink-dark p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{expense.description}</strong><span className="rounded bg-surface-3 px-2 py-0.5 text-[10px] text-[#B9ADA2]">{CATEGORIES[expense.category] ?? expense.category}</span></div>
                <div className="mt-2 text-xs text-subtle">{STATUS[expense.status]}{expense.point ? ` · ${expense.point}` : ''}{expense.supplier ? ` · ${expense.supplier.name}` : ''}</div>
                <div className="mt-1 text-[11px] text-faint">Документ: {expense.documentAmount.toLocaleString('ru-RU')} {expense.currency}{expense.currency !== 'KGS' ? ` · курс ${(expense.exchangeRateMicros / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 6 })}` : ''}{expense.taxAmount > 0 ? ` · налог ${som(expense.taxAmount)} (${expense.taxRateBps / 100}%)` : ' · без налога'}</div>
                {expense.rejectionNote && <div className="mt-2 text-xs text-danger-soft">{expense.rejectionNote}</div>}
              </div>
              <div className="flex min-w-32 flex-col items-end justify-between gap-3">
                <span className="font-mono text-sm font-bold tabular">{som(expense.amount)}</span>
                {expense.status === 'submitted' && <div className="flex gap-2">
                  <button disabled={busy === expense.id} onClick={() => run(expense.id, () => rejectExpense(expense.id, 'Отклонено владельцем', accessToken))} className="text-xs text-danger-soft disabled:opacity-50">Отклонить</button>
                  <button disabled={busy === expense.id} onClick={() => run(expense.id, () => approveExpense(expense.id, accessToken))} className="rounded-[5px] bg-surface-3 px-3 py-1.5 text-xs font-semibold text-lime disabled:opacity-50">Согласовать</button>
                </div>}
                {expense.status === 'approved' && <div className="grid w-52 gap-2">
                  <select aria-label={`Источник выплаты ${expense.description}`} value={fundingByExpense[expense.id] ?? '1000'} onChange={(event) => setFundingByExpense((current) => ({ ...current, [expense.id]: event.target.value }))} className="h-8 rounded-[5px] border border-line bg-surface px-2 text-xs">
                    {accounts.filter((account) => ['1000', '1010', '1020'].includes(account.code)).map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}
                  </select>
                  <input aria-label={`Платёжный референс ${expense.description}`} value={referenceByExpense[expense.id] ?? ''} onChange={(event) => setReferenceByExpense((current) => ({ ...current, [expense.id]: event.target.value }))} maxLength={128} placeholder="Номер документа" className="h-8 rounded-[5px] border border-line bg-surface px-2 text-xs" />
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
                  }} className="rounded-[5px] bg-lime px-3 py-1.5 text-xs font-bold text-coal disabled:opacity-50">Провести выплату</button>
                </div>}
                {expense.status === 'paid' && <div className="text-right text-[11px] text-subtle"><span className="font-mono text-lime">{expense.paymentAccountCode}</span>{expense.paymentReference ? <span className="mt-1 block">{expense.paymentReference}</span> : null}</div>}
              </div>
            </article>
          ))}
          {!expenses.length && <div className="border-t border-surface-3 py-10 text-center text-sm text-subtle">Расходов пока нет</div>}
        </div>
      </section>
      </div>
    </div>
  );
}
