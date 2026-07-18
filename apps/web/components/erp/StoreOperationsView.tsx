'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, CircleAlert, Plus, ShieldCheck } from 'lucide-react';
import {
  completeStoreChecklist,
  createStoreChecklist,
  createStoreIncident,
  fetchStoreOperationsOverview,
  resolveStoreIncident,
  updateStoreChecklistItem,
  type StoreChecklist,
  type StoreIncident,
  type StoreOperationsOverview,
} from '@/lib/api';

type Props = { accessToken: string };
const SEVERITIES: StoreIncident['severity'][] = ['low', 'medium', 'high', 'critical'];
const SEVERITY_LABEL: Record<StoreIncident['severity'], string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критичный' };
const SEVERITY_STYLE: Record<StoreIncident['severity'], string> = { low: 'border-line text-muted', medium: 'border-warn/40 text-warn', high: 'border-danger-soft/50 text-danger-soft', critical: 'border-coral bg-coral/10 text-[#FFB5AA]' };
function today() { return new Date().toISOString().slice(0, 10); }
function newKey(scope: string) { return `erp-store-${scope}-${crypto.randomUUID()}`; }

export function StoreOperationsView({ accessToken }: Props) {
  const [date, setDate] = useState(today);
  const [point, setPoint] = useState('BISHKEK-1');
  const [data, setData] = useState<StoreOperationsOverview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [incidentCategory, setIncidentCategory] = useState('operations');
  const [incidentSeverity, setIncidentSeverity] = useState<StoreIncident['severity']>('medium');
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const commandKeys = useRef(new Map<string, string>());

  const reload = useCallback(async () => {
    setMessage('');
    try { setData(await fetchStoreOperationsOverview(date, point, accessToken)); }
    catch (error) { setData(null); setMessage(error instanceof Error ? error.message : 'Не удалось загрузить операции точки'); }
  }, [accessToken, date, point]);
  useEffect(() => { void reload(); }, [reload]);

  function keyFor(scope: string, fingerprint: string) {
    const current = commandKeys.current.get(`${scope}:${fingerprint}`);
    if (current) return current;
    const key = newKey(scope);
    commandKeys.current.set(`${scope}:${fingerprint}`, key);
    return key;
  }

  async function run(scope: string, action: () => Promise<unknown>) {
    setBusy(scope); setMessage('');
    try { await action(); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Операция не выполнена'); }
    finally { setBusy(''); }
  }

  function createChecklist(type: 'opening' | 'closing') {
    const fingerprint = `${point}:${date}:${type}`;
    return run(`create-${type}`, () => createStoreChecklist({ point: point.trim(), businessDate: date, type }, accessToken, keyFor(`checklist-${type}`, fingerprint)));
  }

  function toggleItem(checklist: StoreChecklist, code: string, checked: boolean) {
    const fingerprint = `${checklist.id}:${code}:${checked}`;
    return run(`item-${checklist.id}-${code}`, () => updateStoreChecklistItem(checklist.id, code, { checked }, accessToken, keyFor('item', fingerprint)));
  }

  function complete(checklist: StoreChecklist) {
    return run(`complete-${checklist.id}`, () => completeStoreChecklist(checklist.id, accessToken, keyFor('complete', checklist.id)));
  }

  async function submitIncident(event: FormEvent) {
    event.preventDefault();
    if (!incidentTitle.trim() || !incidentDescription.trim() || !point.trim()) return;
    const fingerprint = `${point}:${date}:${incidentCategory}:${incidentSeverity}:${incidentTitle.trim()}:${incidentDescription.trim()}`;
    await run('incident-create', async () => {
      await createStoreIncident({ point: point.trim(), businessDate: date, category: incidentCategory.trim(), severity: incidentSeverity, title: incidentTitle.trim(), description: incidentDescription.trim() }, accessToken, keyFor('incident', fingerprint));
      setIncidentTitle(''); setIncidentDescription('');
    });
  }

  async function resolveIncident(event: FormEvent, incident: StoreIncident) {
    event.preventDefault();
    if (!resolution.trim()) return;
    await run(`resolve-${incident.id}`, () => resolveStoreIncident(incident.id, resolution.trim(), accessToken, keyFor('resolve', `${incident.id}:${resolution.trim()}`)));
    setResolving(null); setResolution('');
  }

  const checklist = (type: 'opening' | 'closing') => data?.checklists.find((item) => item.type === type);
  const checklistCard = (type: 'opening' | 'closing', title: string, description: string) => {
    const item = checklist(type);
    const completeCount = item?.items.filter((entry) => entry.checked).length ?? 0;
    return <section className="rounded-[8px] border border-surface-3 bg-ink-dark p-5" aria-labelledby={`store-${type}-title`}>
      <div className="flex items-start gap-3"><div className={`grid h-9 w-9 flex-none place-items-center rounded-[8px] ${item?.status === 'completed' ? 'bg-[#26351B] text-lime' : 'bg-[#2A241F] text-bright'}`}><ShieldCheck size={18} /></div><div className="min-w-0 flex-1"><h3 id={`store-${type}-title`} className="font-display text-sm font-bold">{title}</h3><p className="mt-1 text-xs text-subtle">{description}</p></div>{item && <span className={`rounded-[5px] border px-2 py-1 text-[10px] font-semibold ${item.status === 'completed' ? 'border-lime/40 text-lime' : 'border-warn/40 text-warn'}`}>{item.status === 'completed' ? 'Завершён' : `${completeCount}/${item.items.length}`}</span>}</div>
      {!item ? <button type="button" onClick={() => void createChecklist(type)} disabled={busy === `create-${type}`} className="mt-5 flex h-10 items-center gap-2 rounded-[6px] bg-coral px-4 text-sm font-bold text-white disabled:opacity-50"><Plus size={16} />{busy === `create-${type}` ? 'Создаём…' : 'Открыть чек-лист'}</button> : <div className="mt-5 space-y-2">{item.items.map((entry) => <button key={entry.id} type="button" disabled={item.status === 'completed' || busy === `item-${item.id}-${entry.code}`} onClick={() => void toggleItem(item, entry.code, !entry.checked)} className="flex w-full items-center gap-3 border-t border-surface-3 py-3 text-left text-xs disabled:cursor-default"><span className={`grid h-5 w-5 flex-none place-items-center rounded-[5px] border ${entry.checked ? 'border-lime bg-[#26351B] text-lime' : 'border-[#5F5750] text-transparent'}`}><Check size={13} /></span><span className={entry.checked ? 'text-muted line-through' : 'text-[#F5EEE8]'}>{entry.label}</span></button>)}{item.status !== 'completed' && <button type="button" disabled={completeCount !== item.items.length || busy === `complete-${item.id}`} onClick={() => void complete(item)} className="mt-3 h-10 rounded-[6px] bg-lime px-4 text-sm font-bold text-[#111] disabled:cursor-not-allowed disabled:opacity-40">{busy === `complete-${item.id}` ? 'Фиксируем…' : 'Завершить чек-лист'}</button>}</div>}
    </section>;
  };

  return <div data-testid="store-operations-view" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-surface-3 pb-4"><div><p className="text-[10px] uppercase tracking-[0.12em] text-subtle">Точка продаж</p><h2 className="mt-1 font-display text-lg font-bold">Операционка точки</h2><p className="mt-1 text-xs text-subtle">Открытие, закрытие, безопасность и журнал инцидентов</p></div><div className="flex flex-wrap gap-2"><label className="text-[10px] text-subtle">Дата<input aria-label="Дата операций точки" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" /></label><label className="text-[10px] text-subtle">Код точки<input aria-label="Код операционной точки" value={point} onChange={(event) => setPoint(event.target.value)} className="mt-1 block h-9 w-36 rounded-[6px] border border-line bg-surface px-2 font-mono text-xs text-white" /></label></div></div>
    {message && <div role="alert" className="rounded-[6px] border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-[#FFB5AA]">{message}</div>}
    <div className="grid gap-2 sm:grid-cols-4">{[['Чек-листы', data?.summary.checklists ?? 0], ['Завершены', data?.summary.completedChecklists ?? 0], ['Открытые инциденты', data?.summary.openIncidents ?? 0], ['Критичные', data?.summary.criticalIncidents ?? 0]].map(([label, value]) => <div key={String(label)} className="border-b border-surface-3 bg-surface px-4 py-3"><span className="text-[10px] uppercase text-subtle">{label}</span><strong className={`mt-1 block font-mono text-lg ${label === 'Критичные' && Number(value) ? 'text-danger-soft' : 'text-lime'}`}>{value}</strong></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">{checklistCard('opening', 'Открытие точки', 'Перед первой продажей и началом смены')}{checklistCard('closing', 'Закрытие точки', 'Перед закрытием смены и передачей помещения')}</div>
    <section className="rounded-[8px] border border-surface-3 bg-ink-dark p-5" aria-labelledby="store-incidents-title"><div className="flex items-center gap-3"><CircleAlert size={18} className="text-danger-soft" /><div><h3 id="store-incidents-title" className="font-display text-sm font-bold">Инциденты и безопасность</h3><p className="mt-1 text-xs text-subtle">Критичные события остаются открытыми до подтверждённого решения</p></div></div><div className="mt-4 space-y-2">{data?.incidents.map((incident) => <article key={incident.id} data-testid={`store-incident-${incident.id}`} className="border-t border-surface-3 py-3"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{incident.title}</strong><span className={`rounded-[5px] border px-2 py-0.5 text-[10px] ${SEVERITY_STYLE[incident.severity]}`}>{SEVERITY_LABEL[incident.severity]}</span><span className="text-[10px] text-subtle">{incident.status === 'resolved' ? 'закрыт' : 'открыт'}</span></div><p className="mt-1 text-xs text-muted">{incident.description}</p>{incident.resolution && <p className="mt-1 text-xs text-success-soft">Решение: {incident.resolution}</p>}</div>{incident.status !== 'resolved' && <button type="button" onClick={() => setResolving(incident.id)} className="h-8 rounded-[6px] border border-lime/40 px-3 text-xs font-semibold text-lime">Закрыть</button>}</div>{resolving === incident.id && <form onSubmit={(event) => void resolveIncident(event, incident)} className="mt-3 flex gap-2"><input autoFocus aria-label={`Решение инцидента ${incident.title}`} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Что сделано" className="h-9 min-w-0 flex-1 rounded-[6px] border border-line bg-surface px-3 text-xs" /><button type="submit" disabled={!resolution.trim() || busy === `resolve-${incident.id}`} className="h-9 rounded-[6px] bg-[#26351B] px-3 text-xs font-semibold text-lime">Подтвердить</button></form>}</article>)}{!data?.incidents.length && <div className="py-8 text-center text-sm text-subtle">За выбранную дату инцидентов нет</div>}</div><form onSubmit={(event) => void submitIncident(event)} className="mt-4 grid gap-2 border-t border-surface-3 pt-4 md:grid-cols-[0.8fr_0.8fr_1.2fr_1.6fr_auto]"><input aria-label="Категория инцидента" value={incidentCategory} onChange={(event) => setIncidentCategory(event.target.value)} placeholder="Категория" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><select aria-label="Серьезность инцидента" value={incidentSeverity} onChange={(event) => setIncidentSeverity(event.target.value as StoreIncident['severity'])} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm">{SEVERITIES.map((item) => <option key={item} value={item}>{SEVERITY_LABEL[item]}</option>)}</select><input aria-label="Заголовок инцидента" value={incidentTitle} onChange={(event) => setIncidentTitle(event.target.value)} placeholder="Что произошло" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><input aria-label="Описание инцидента" value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} placeholder="Описание и первичная мера" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><button type="submit" disabled={!incidentTitle.trim() || !incidentDescription.trim() || busy === 'incident-create'} className="h-10 rounded-[6px] bg-coral px-4 text-sm font-bold text-white disabled:opacity-50">Зафиксировать</button></form></section>
  </div>;
}
