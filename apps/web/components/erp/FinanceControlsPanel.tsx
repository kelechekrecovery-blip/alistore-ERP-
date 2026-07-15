'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchAccountingPeriods, fetchBankStatements, fetchCashIncassations, fetchFinancialStatements, fetchSupplierAging, type AccountingPeriod, type BankStatementSummary, type CashIncassation, type FinancialStatements, type SupplierAgingReport } from '@/lib/api';
import { som } from '@/lib/format';

export function FinanceControlsPanel({ accessToken }: { accessToken: string }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [point, setPoint] = useState('');
  const [statements, setStatements] = useState<FinancialStatements | null>(null);
  const [aging, setAging] = useState<SupplierAgingReport | null>(null);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [banks, setBanks] = useState<BankStatementSummary[]>([]);
  const [incassations, setIncassations] = useState<CashIncassation[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const reload = useCallback(() => {
    setState('loading');
    Promise.all([
      fetchFinancialStatements(period, point, accessToken),
      fetchSupplierAging(accessToken),
      fetchAccountingPeriods(accessToken),
      fetchBankStatements(accessToken),
      fetchCashIncassations(accessToken),
    ]).then(([nextStatements, nextAging, nextPeriods, nextBanks, nextIncassations]) => {
      setStatements(nextStatements); setAging(nextAging); setPeriods(nextPeriods); setBanks(nextBanks); setIncassations(nextIncassations); setState('ready');
    }).catch(() => setState('error'));
  }, [accessToken, period, point]);

  useEffect(() => reload(), [reload]);

  return (
    <section aria-labelledby="finance-controls-title" className="border-b border-[#2E2822] pb-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="finance-controls-title" className="font-display text-[15px] font-bold">Учетный контроль</h2><p className="mt-1 text-xs text-[#8A7F76]">Журнал, AP, банки, инкассация и закрытие периодов из одной панели.</p></div>
        <div className="flex flex-wrap gap-2">
          <label className="text-[11px] text-[#8A7F76]">Период<input aria-label="Период отчетов" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-xs text-white" /></label>
          <label className="text-[11px] text-[#8A7F76]">Точка<input aria-label="Точка отчетов" value={point} onChange={(event) => setPoint(event.target.value)} placeholder="Все точки" className="mt-1 block h-9 w-32 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-xs text-white" /></label>
          <button type="button" onClick={reload} className="h-9 self-end rounded-[6px] border border-[#3A332C] px-3 text-xs text-[#D8CFC6] hover:border-[#C6FF3D] hover:text-[#C6FF3D]">Обновить</button>
        </div>
      </div>
      {state === 'error' && <div className="mb-3 rounded-[6px] border border-[#6B3B32] bg-[#321F1A] px-3 py-2 text-xs text-[#FFB5AA]">Часть учетных данных недоступна для этой роли или сервиса.</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Прибыль периода" value={som(statements?.profitAndLoss.netProfit ?? 0)} tone="text-[#C6FF3D]" />
        <Metric label="Движение денег" value={som(statements?.cashFlow.cashMovement ?? 0)} />
        <Metric label="AP к оплате" value={som(aging?.totalOutstanding ?? 0)} tone="text-[#FFB86B]" />
        <Metric label="Инкассация" value={som(incassations.reduce((sum, row) => sum + row.amount, 0))} />
        <Metric label="Проводки" value={String(statements?.entries ?? 0)} tone={statements?.balanced ? 'text-[#C6FF3D]' : 'text-[#FF8A7A]'} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <ControlList title="Периоды" empty="Периоды еще не открывались">{periods.slice(0, 4).map((row) => <Row key={row.id} label={row.period} value={row.status === 'hard_closed' ? 'закрыт' : row.status === 'soft_closed' ? 'мягко закрыт' : 'открыт'} tone={row.status === 'hard_closed' ? 'text-[#FFB5AA]' : 'text-[#C6FF3D]'} />)}</ControlList>
        <ControlList title="Банковские выписки" empty="Выписок еще нет">{banks.slice(0, 4).map((row) => <Row key={row.id} label={row.statementNumber} value={`${row.status} · ${som(row.closingBalance)}`} tone={row.status === 'reconciled' ? 'text-[#C6FF3D]' : 'text-[#FFB86B]'} />)}</ControlList>
        <ControlList title="Инкассация" empty="Инкассаций еще нет">{incassations.slice(0, 4).map((row) => <Row key={row.id} label={row.point} value={`${row.status} · ${som(row.amount)}`} tone={row.status === 'reconciled' ? 'text-[#C6FF3D]' : 'text-[#FFB86B]'} />)}</ControlList>
      </div>
    </section>
  );
}

function Metric({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-[7px] border border-[#2E2822] bg-[#16130F] p-3"><div className="text-[11px] text-[#8A7F76]">{label}</div><strong className={`mt-1 block font-mono text-base ${tone}`}>{value}</strong></div>;
}

function ControlList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return <div className="rounded-[7px] border border-[#2E2822] bg-[#16130F] p-3"><h3 className="mb-2 text-xs font-bold text-[#D8CFC6]">{title}</h3>{children || <div className="py-3 text-xs text-[#6E645C]">{empty}</div>}</div>;
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="flex items-center justify-between border-t border-[#221E19] py-2 text-xs"><span className="truncate text-[#A79C92]">{label}</span><span className={`ml-2 whitespace-nowrap font-mono ${tone}`}>{value}</span></div>;
}
