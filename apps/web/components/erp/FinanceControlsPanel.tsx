'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { closeAccountingPeriod, createCashIncassation, downloadAccountingJournal, fetchAccountingPeriods, fetchBankStatements, fetchCashIncassations, fetchCollectableShifts, fetchCustomerAging, fetchFinancialStatements, fetchSupplierAging, fetchTaxPeriod, settleTaxPeriod, type AccountingPeriod, type ArAgingReport, type BankStatementSummary, type CashIncassation, type CollectableShift, type FinancialStatements, type SupplierAgingReport, type TaxPeriodReport } from '@/lib/api';
import { som } from '@/lib/format';

export function FinanceControlsPanel({ accessToken }: { accessToken: string }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [arDate, setArDate] = useState(new Date().toISOString().slice(0, 10));
  const [point, setPoint] = useState('');
  const [statements, setStatements] = useState<FinancialStatements | null>(null);
  const [aging, setAging] = useState<SupplierAgingReport | null>(null);
  const [arAging, setArAging] = useState<ArAgingReport | null>(null);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [banks, setBanks] = useState<BankStatementSummary[]>([]);
  const [incassations, setIncassations] = useState<CashIncassation[]>([]);
  const [collectable, setCollectable] = useState<CollectableShift[]>([]);
  const [draft, setDraft] = useState({ shiftId: '', amount: '', destinationCode: '3000' as '1010' | '3000', reference: '' });
  const [collecting, setCollecting] = useState(false);
  const [tax, setTax] = useState<TaxPeriodReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [action, setAction] = useState<'idle' | 'soft' | 'tax' | 'hard'>('idle');
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);

  const reload = useCallback(() => {
    setState('loading');
    Promise.all([
      fetchFinancialStatements(period, point, accessToken),
      fetchSupplierAging(accessToken),
      fetchCustomerAging(arDate, accessToken),
      fetchAccountingPeriods(accessToken),
      fetchBankStatements(accessToken),
      fetchCashIncassations(accessToken),
      fetchTaxPeriod(period, point, accessToken),
      fetchCollectableShifts(accessToken),
    ]).then(([nextStatements, nextAging, nextArAging, nextPeriods, nextBanks, nextIncassations, nextTax, nextCollectable]) => {
      setStatements(nextStatements); setAging(nextAging); setArAging(nextArAging); setPeriods(nextPeriods); setBanks(nextBanks); setIncassations(nextIncassations); setTax(nextTax); setCollectable(nextCollectable); setState('ready');
    }).catch(() => setState('error'));
  }, [accessToken, arDate, period, point]);

  useEffect(() => reload(), [reload]);

  async function submitIncassation() {
    const amount = Number(draft.amount);
    if (!draft.shiftId || !Number.isSafeInteger(amount) || amount < 1) return;
    setCollecting(true); setNotice('');
    try {
      // Stable key per (shift, amount, destination) so a double click replays
      // instead of collecting twice.
      const key = `ui-inc-${draft.shiftId}-${amount}-${draft.destinationCode}`;
      await createCashIncassation(draft.shiftId, { amount, destinationCode: draft.destinationCode, reference: draft.reference.trim() || undefined }, key, accessToken);
      setDraft({ shiftId: '', amount: '', destinationCode: draft.destinationCode, reference: '' });
      setNotice(draft.destinationCode === '3000' ? 'Выемка владельцем проведена' : 'Инкассация в банк проведена');
      reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Инкассация не проведена');
    } finally { setCollecting(false); }
  }

  const runAction = async (next: 'soft' | 'tax' | 'hard') => {
    setAction(next); setNotice('');
    try {
      if (next === 'tax') await settleTaxPeriod(period, point, accessToken);
      else await closeAccountingPeriod(period, next === 'soft' ? 'soft_closed' : 'hard_closed', accessToken);
      setNotice(next === 'soft' ? 'Период мягко закрыт.' : next === 'tax' ? 'Налоговая сверка зафиксирована.' : 'Период окончательно закрыт.');
      reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Операция учёта не выполнена');
    } finally {
      setAction('idle');
    }
  };

  const exportJournal = async () => {
    setExporting(true);
    setNotice('');
    try {
      const blob = await downloadAccountingJournal(period, point, accessToken);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `alistore-journal-${period}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice('Журнал скачан.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось скачать журнал');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-labelledby="finance-controls-title" className="border-b border-surface-3 pb-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="finance-controls-title" className="font-display text-[15px] font-bold">Учетный контроль</h2><p className="mt-1 text-xs text-subtle">Журнал, AP, AR, банки, инкассация и закрытие периодов из одной панели.</p></div>
        <div className="flex flex-wrap gap-2">
          <label className="text-[11px] text-subtle">Период<input aria-label="Период отчетов" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-line bg-surface px-3 text-xs text-white" /></label>
          <label className="text-[11px] text-subtle">AR на дату<input aria-label="Дата AR" type="date" value={arDate} onChange={(event) => setArDate(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-line bg-surface px-3 text-xs text-white" /></label>
          <label className="text-[11px] text-subtle">Точка<input aria-label="Точка отчетов" value={point} onChange={(event) => setPoint(event.target.value)} placeholder="Все точки" className="mt-1 block h-9 w-32 rounded-[6px] border border-line bg-surface px-3 text-xs text-white" /></label>
          <button type="button" onClick={reload} className="h-9 self-end rounded-[6px] border border-line px-3 text-xs text-bright hover:border-lime hover:text-lime">Обновить</button>
          <button type="button" onClick={exportJournal} disabled={exporting} className="h-9 self-end rounded-[6px] bg-lime px-3 text-xs font-bold text-coal disabled:opacity-40">{exporting ? 'Готовим CSV…' : 'Скачать журнал CSV'}</button>
        </div>
      </div>
      {state === 'error' && <div className="mb-3 rounded-[6px] border border-[#6B3B32] bg-surface-3 px-3 py-2 text-xs text-coral-tint">Часть учетных данных недоступна для этой роли или сервиса.</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        <Metric label="Прибыль периода" value={som(statements?.profitAndLoss.netProfit ?? 0)} tone="text-lime" />
        <Metric label="Движение денег" value={som(statements?.cashFlow.cashMovement ?? 0)} />
        <Metric label="AP к оплате" value={som(aging?.totalOutstanding ?? 0)} tone="text-[#FFB86B]" />
        <Metric label="AR к получению" value={som(arAging?.totalOutstanding ?? 0)} tone="text-[#8FD3FF]" />
        <Metric label="К инкассации" value={som(collectable.reduce((sum, row) => sum + row.available, 0))} tone={collectable.length ? 'text-[#FFB86B]' : 'text-lime'} />
        <Metric label="Проводки" value={String(statements?.entries ?? 0)} tone={statements?.balanced ? 'text-lime' : 'text-danger-soft'} />
        <Metric label="Исходящий НДС" value={som(tax?.outputTax ?? 0)} tone="text-[#FFB86B]" />
        <Metric label="НДС к уплате" value={som(tax?.payableAmount ?? 0)} tone={(tax?.payableAmount ?? 0) > 0 ? 'text-danger-soft' : 'text-lime'} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <ControlList title="Периоды" empty="Периоды еще не открывались">{periods.slice(0, 4).map((row) => <Row key={row.id} label={row.period} value={row.status === 'hard_closed' ? 'закрыт' : row.status === 'soft_closed' ? 'мягко закрыт' : 'открыт'} tone={row.status === 'hard_closed' ? 'text-coral-tint' : 'text-lime'} />)}</ControlList>
        <ControlList title="Банковские выписки" empty="Выписок еще нет">{banks.slice(0, 4).map((row) => <Row key={row.id} label={row.statementNumber} value={`${row.status} · ${som(row.closingBalance)}`} tone={row.status === 'reconciled' ? 'text-lime' : 'text-[#FFB86B]'} />)}</ControlList>
        <ControlList title="Инкассация" empty="Инкассаций еще нет">
          {incassations.slice(0, 4).map((row) => <Row key={row.id} label={`${row.point} · ${row.destinationCode === '3000' ? 'владелец' : 'банк'}`} value={`${row.status} · ${som(row.amount)}`} tone={row.status === 'reconciled' ? 'text-lime' : 'text-[#FFB86B]'} />)}
          <div className="mt-3 border-t border-surface-2 pt-3">
            {collectable.length === 0 && <p className="text-[11px] text-subtle">Нет закрытых смен с наличными</p>}
            {collectable.length > 0 && (
              <div className="grid gap-2">
                <select
                  aria-label="Смена для инкассации"
                  value={draft.shiftId}
                  onChange={(event) => {
                    const shift = collectable.find((row) => row.id === event.target.value);
                    setDraft((current) => ({ ...current, shiftId: event.target.value, amount: shift ? String(shift.available) : '' }));
                  }}
                  className="h-8 rounded-[6px] border border-line bg-surface px-2 text-[11px] text-white"
                >
                  <option value="">Смена…</option>
                  {collectable.map((row) => <option key={row.id} value={row.id}>{row.point} · {som(row.available)}</option>)}
                </select>
                <div className="flex gap-2">
                  <input
                    aria-label="Сумма инкассации"
                    inputMode="numeric"
                    value={draft.amount}
                    onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value.replace(/[^0-9]/g, '') }))}
                    placeholder="Сумма"
                    className="h-8 w-24 rounded-[6px] border border-line bg-surface px-2 text-[11px] text-white"
                  />
                  <select
                    aria-label="Назначение"
                    value={draft.destinationCode}
                    onChange={(event) => setDraft((current) => ({ ...current, destinationCode: event.target.value as '1010' | '3000' }))}
                    className="h-8 flex-1 rounded-[6px] border border-line bg-surface px-2 text-[11px] text-white"
                  >
                    <option value="3000">Владельцу</option>
                    <option value="1010">В банк</option>
                  </select>
                </div>
                <input
                  aria-label="Комментарий к инкассации"
                  value={draft.reference}
                  onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
                  placeholder="Комментарий"
                  className="h-8 rounded-[6px] border border-line bg-surface px-2 text-[11px] text-white"
                />
                <button
                  type="button"
                  disabled={collecting || !draft.shiftId || !draft.amount}
                  onClick={submitIncassation}
                  className="h-8 rounded-[6px] bg-lime px-3 text-[11px] font-bold text-[#1A2300] disabled:opacity-50"
                >{collecting ? '…' : 'Провести'}</button>
              </div>
            )}
          </div>
        </ControlList>
        <ControlList title={`Дебиторка · ${arDate}`} empty="Открытых долгов нет">
          {arAging && <>
            <Row label="К получению" value={som(arAging.totalOutstanding)} tone="text-[#8FD3FF]" />
            <Row label="Текущая" value={som(arAging.totals.current)} tone="text-lime" />
            <Row label="1–30 дней" value={som(arAging.totals['1_30'])} tone="text-[#FFB86B]" />
            <Row label="31+ дней" value={som(arAging.totals['31_60'] + arAging.totals['61_90'] + arAging.totals['90_plus'])} tone="text-danger-soft" />
            {arAging.rows.slice(0, 2).map((row) => <Row key={row.id} label={row.customer.name} value={`${som(row.balance)} · ${row.bucket}`} tone={row.status === 'settled' ? 'text-lime' : 'text-bright'} />)}
          </>}
        </ControlList>
        <ControlList title={`Налоговый период${point.trim() ? ` · ${point.trim()}` : ''}`} empty="Налоговых движений нет">
          {tax && <>
            <Row label="Исходящий НДС" value={som(tax.outputTax)} tone="text-[#FFB86B]" />
            <Row label="Входящий НДС" value={som(tax.inputTax)} tone="text-[#8FD3FF]" />
            <Row label="Взаимозачёт" value={som(tax.offsetAmount)} tone="text-bright" />
            <Row label={tax.payableAmount > 0 ? 'К уплате' : 'К возмещению'} value={som(tax.payableAmount || tax.recoverableAmount)} tone={tax.payableAmount > 0 ? 'text-danger-soft' : 'text-lime'} />
          </>}
        </ControlList>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-surface-3 pt-3">
        {(tax?.status ?? 'open') === 'open' && <button type="button" disabled={action !== 'idle'} onClick={() => runAction('soft')} className="h-9 rounded-[6px] border border-[#5B5148] px-3 text-xs text-bright disabled:opacity-40">Мягко закрыть период</button>}
        {tax?.status === 'soft_closed' && !tax.settlement && !point.trim() && <button type="button" disabled={action !== 'idle'} onClick={() => runAction('tax')} className="h-9 rounded-[6px] bg-lime px-3 text-xs font-bold text-coal disabled:opacity-40">Зафиксировать НДС</button>}
        {tax?.status === 'soft_closed' && tax.settlement && !point.trim() && <button type="button" disabled={action !== 'idle'} onClick={() => runAction('hard')} className="h-9 rounded-[6px] border border-danger-soft px-3 text-xs text-coral-tint disabled:opacity-40">Закрыть период окончательно</button>}
        {point.trim() && <span className="text-[11px] text-subtle">Окончательное закрытие доступно в отчёте «Все точки».</span>}
        {notice && <span role="status" className="text-xs text-bright">{notice}</span>}
      </div>
    </section>
  );
}

function Metric({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-[7px] border border-surface-3 bg-ink-dark p-3"><div className="text-[11px] text-subtle">{label}</div><strong className={`mt-1 block font-mono text-base ${tone}`}>{value}</strong></div>;
}

function ControlList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return <div className="rounded-[7px] border border-surface-3 bg-ink-dark p-3"><h3 className="mb-2 text-xs font-bold text-bright">{title}</h3>{children || <div className="py-3 text-xs text-faint">{empty}</div>}</div>;
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="flex items-center justify-between border-t border-surface-2 py-2 text-xs"><span className="truncate text-muted">{label}</span><span className={`ml-2 whitespace-nowrap font-mono ${tone}`}>{value}</span></div>;
}
