'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  closeFinanceSettlement,
  createFinanceSettlement,
  fetchFinanceSettlementSources,
  fetchFinanceSettlements,
  resolveFinanceSettlement,
  type FinanceSettlementRun,
  type FinanceSettlementSource,
} from '@/lib/api';
import { som } from '@/lib/format';

const SOURCE_LABEL: Record<string, string> = {
  provider_payment: 'Провайдер', pos_shift: 'POS', courier_cod: 'COD', refund: 'Возврат',
};
const STATUS_LABEL: Record<string, string> = { balanced: 'Сходится', disputed: 'Расхождение', closed: 'Закрыта' };

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function FinanceSettlementWorkspace({ accessToken }: { accessToken: string }) {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const [from, setFrom] = useState(`${today.toISOString().slice(0, 7)}-01`);
  const [to, setTo] = useState(isoDate(tomorrow));
  const [point, setPoint] = useState('');
  const [sources, setSources] = useState<FinanceSettlementSource[]>([]);
  const [runs, setRuns] = useState<FinanceSettlementRun[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const commandKeys = useRef(new Map<string, { signature: string; key: string }>());

  function commandKey(scope: string, payload: unknown) {
    const signature = JSON.stringify(payload);
    const current = commandKeys.current.get(scope);
    if (current?.signature === signature) return current.key;
    const next = { signature, key: crypto.randomUUID() };
    commandKeys.current.set(scope, next);
    return next.key;
  }

  const reloadRuns = useCallback(() => fetchFinanceSettlements(accessToken).then(setRuns), [accessToken]);
  useEffect(() => { reloadRuns().catch(() => setMessage('Не удалось загрузить журнал сверок')); }, [reloadRuns]);

  const loadSources = useCallback(async () => {
    setBusy('sources'); setMessage('');
    try {
      const next = await fetchFinanceSettlementSources(from, to, point, accessToken);
      setSources(next);
      setSelected(new Set(next.map((source) => source.sourceRef)));
      setActuals(Object.fromEntries(next.map((source) => [source.sourceRef, String(source.suggestedActualAmount)])));
      setReasons({});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось найти источники');
    } finally { setBusy(''); }
  }, [accessToken, from, point, to]);

  const totals = useMemo(() => sources.filter((source) => selected.has(source.sourceRef)).reduce((sum, source) => {
    const actual = Number(actuals[source.sourceRef]);
    return { expected: sum.expected + source.expectedAmount, actual: sum.actual + (Number.isFinite(actual) ? actual : 0) };
  }, { expected: 0, actual: 0 }), [actuals, selected, sources]);

  async function createRun() {
    const chosen = sources.filter((source) => selected.has(source.sourceRef));
    if (!chosen.length) return setMessage('Выберите хотя бы один источник');
    const entries = chosen.map((source) => ({
      sourceType: source.sourceType, sourceRef: source.sourceRef,
      actualAmount: Math.round(Number(actuals[source.sourceRef])),
      ...(reasons[source.sourceRef]?.trim() ? { reason: reasons[source.sourceRef].trim() } : {}),
    }));
    if (entries.some((entry) => !Number.isFinite(entry.actualAmount))) return setMessage('Проверьте фактические суммы');
    setBusy('create'); setMessage('');
    try {
      const input = { from, to, ...(point.trim() ? { point: point.trim() } : {}), entries };
      await createFinanceSettlement(input, accessToken, commandKey('create', input));
      commandKeys.current.delete('create');
      setSources([]); setSelected(new Set()); await reloadRuns();
      setMessage('Сверка создана. Закройте её после проверки всех строк.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Сверка не создана'); }
    finally { setBusy(''); }
  }

  async function closeRun(runId: string) {
    setBusy(runId); setMessage('');
    try {
      await closeFinanceSettlement(runId, accessToken, commandKey(`close:${runId}`, { runId }));
      commandKeys.current.delete(`close:${runId}`); await reloadRuns();
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Сверка не закрыта'); }
    finally { setBusy(''); }
  }

  async function resolveLine(runId: string, lineId: string, expectedAmount: number, actualAmount: number) {
    const reason = reasons[lineId]?.trim();
    if (!reason) return setMessage('Для исправления строки укажите основание');
    const adjustmentAmount = expectedAmount - actualAmount;
    const payload = { runId, lineId, adjustmentAmount, reason };
    setBusy(lineId); setMessage('');
    try {
      await resolveFinanceSettlement(runId, lineId, adjustmentAmount, reason, accessToken, commandKey(`resolve:${lineId}`, payload));
      commandKeys.current.delete(`resolve:${lineId}`); await reloadRuns();
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Строка не исправлена'); }
    finally { setBusy(''); }
  }

  return (
    <section aria-labelledby="settlements-title" className="border-b border-surface-3 pb-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="settlements-title" className="font-display text-[15px] font-bold">Сверка поступлений</h2>
          <p className="mt-1 text-xs text-subtle">Провайдеры, кассовые смены, COD и возвраты в едином закрываемом реестре</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-subtle">С<input aria-label="Начало периода сверки" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" /></label>
          <label className="text-[11px] text-subtle">По<input aria-label="Конец периода сверки" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" /></label>
          <input aria-label="Точка сверки" value={point} onChange={(event) => setPoint(event.target.value)} placeholder="Все точки" className="h-9 w-32 rounded-[6px] border border-line bg-surface px-3 text-xs" />
          <button type="button" onClick={loadSources} disabled={busy === 'sources'} className="h-9 rounded-[6px] bg-[#29231E] px-4 text-xs font-semibold text-lime disabled:opacity-50">{busy === 'sources' ? 'Ищем...' : 'Найти источники'}</button>
        </div>
      </div>
      {message && <div role="status" className="mb-3 rounded-[6px] border border-[#494037] bg-surface px-3 py-2 text-xs text-bright">{message}</div>}
      {sources.length > 0 && <div className="overflow-hidden rounded-[7px] border border-surface-3 bg-ink-dark">
        {sources.map((source) => {
          const actual = Number(actuals[source.sourceRef]); const variance = (Number.isFinite(actual) ? actual : 0) - source.expectedAmount;
          return <div key={`${source.sourceType}:${source.sourceRef}`} className="grid gap-2 border-b border-surface-2 p-3 last:border-b-0 md:grid-cols-[24px_minmax(180px,1fr)_120px_120px_minmax(160px,0.8fr)] md:items-center">
            <input aria-label={`Выбрать ${source.label}`} type="checkbox" checked={selected.has(source.sourceRef)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(source.sourceRef) : next.delete(source.sourceRef); return next; })} />
            <div className="min-w-0"><div className="truncate text-xs font-semibold text-[#E5DCD3]">{source.label}</div><span className="text-[10px] uppercase text-subtle">{SOURCE_LABEL[source.sourceType]}</span></div>
            <div className="text-xs"><span className="text-subtle">Ожидание </span><strong className="font-mono">{som(source.expectedAmount)}</strong></div>
            <input aria-label={`Факт ${source.label}`} value={actuals[source.sourceRef] ?? ''} onChange={(event) => setActuals((current) => ({ ...current, [source.sourceRef]: event.target.value }))} inputMode="numeric" className={`h-9 min-w-0 rounded-[5px] border bg-surface px-2 font-mono text-xs ${variance ? 'border-danger-soft' : 'border-line'}`} />
            <input aria-label={`Причина ${source.label}`} value={reasons[source.sourceRef] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [source.sourceRef]: event.target.value }))} placeholder={variance ? `Причина ${variance > 0 ? '+' : ''}${variance}` : 'Без расхождения'} className="h-9 min-w-0 rounded-[5px] border border-line bg-surface px-2 text-xs" />
          </div>;
        })}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3 text-xs">
          <div>Ожидание <strong className="font-mono">{som(totals.expected)}</strong> · Факт <strong className="font-mono">{som(totals.actual)}</strong> · <span className={totals.actual - totals.expected ? 'text-danger-soft' : 'text-success-soft'}>Δ {som(totals.actual - totals.expected)}</span></div>
          <button type="button" onClick={createRun} disabled={busy === 'create'} className="h-9 rounded-[6px] bg-lime px-4 font-bold text-[#111] disabled:opacity-50">{busy === 'create' ? 'Создаём...' : 'Создать сверку'}</button>
        </div>
      </div>}
      <div className="mt-4 grid gap-2">
        {runs.slice(0, 12).map((run) => <article key={run.id} data-testid="finance-settlement-run" className="rounded-[7px] border border-surface-3 bg-ink-dark p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><strong className="text-sm">Сверка {run.id.slice(-7)}</strong><span className={`rounded px-2 py-0.5 text-[10px] ${run.status === 'disputed' ? 'bg-[#472521] text-[#FFB5AA]' : run.status === 'closed' ? 'bg-[#233426] text-success-soft' : 'bg-[#35321E] text-[#E6E183]'}`}>{STATUS_LABEL[run.status]}</span></div><div className="mt-1 text-[11px] text-subtle">{new Date(run.periodStart).toLocaleDateString('ru-RU')} – {new Date(run.periodEnd).toLocaleDateString('ru-RU')}{run.point ? ` · ${run.point}` : ''}</div></div>
            <div className="text-right text-xs"><strong className="font-mono">{som(run.actualTotal)}</strong>{run.adjustmentTotal !== 0 && <div className="text-[#E6E183]">Корр. {som(run.adjustmentTotal)}</div>}<div className={run.variance ? 'text-danger-soft' : 'text-success-soft'}>Δ {som(run.variance)}</div></div>
          </div>
          <div className="mt-3 grid gap-1">
            {run.lines.map((line) => <div key={line.id} className="grid gap-2 border-t border-surface-2 py-2 text-xs md:grid-cols-[minmax(180px,1fr)_110px_110px_minmax(180px,0.8fr)] md:items-center">
              <span className="min-w-0 truncate text-bright">{line.label}</span><span className="font-mono">{som(line.expectedAmount)}</span><span className={`font-mono ${line.variance ? 'text-danger-soft' : 'text-success-soft'}`}>{som(line.actualAmount)} ({line.variance > 0 ? '+' : ''}{line.variance})</span>
              {line.status === 'disputed' ? <div className="flex gap-2"><input aria-label={`Основание компенсации ${line.label}`} value={reasons[line.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [line.id]: event.target.value }))} placeholder={`Компенсация ${som(line.expectedAmount - line.actualAmount)}`} className="h-8 min-w-0 flex-1 rounded-[5px] border border-line bg-surface px-2 text-xs" /><button type="button" onClick={() => resolveLine(run.id, line.id, line.expectedAmount, line.actualAmount)} disabled={busy === line.id} className="rounded-[5px] bg-[#29231E] px-3 text-lime disabled:opacity-50">Создать корректировку</button></div> : <span className="text-subtle">{line.adjustmentAmount ? `Корр. ${som(line.adjustmentAmount)}` : line.status === 'reconciled' ? 'Проведено' : 'Готово'}</span>}
            </div>)}
          </div>
          {run.status === 'balanced' && <div className="mt-3 flex justify-end"><button type="button" onClick={() => closeRun(run.id)} disabled={busy === run.id} className="h-9 rounded-[6px] bg-lime px-4 text-xs font-bold text-[#111] disabled:opacity-50">Провести и закрыть</button></div>}
        </article>)}
        {!runs.length && <div className="border-t border-surface-3 py-6 text-center text-xs text-subtle">Закрытых сверок пока нет</div>}
      </div>
    </section>
  );
}
