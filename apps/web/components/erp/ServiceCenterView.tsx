'use client';

import { Camera, CheckCircle2, Clock3, PackageCheck, Play, Plus, RefreshCw, RotateCcw, Smartphone, Stethoscope, UserRound, Wrench, XCircle } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPaidRepair,
  createServiceWorkOrder,
  assignServiceTechnician,
  cancelServiceLoaner,
  diagnoseServiceWorkOrder,
  closeServiceRepair,
  completeServiceRepair,
  consumeServicePart,
  fetchServiceQueue,
  fetchServiceLoaners,
  issueServiceLoaner,
  prepareServiceLoaner,
  registerServiceLoaner,
  returnServiceLoaner,
  resolveServiceLoanerDispute,
  uploadEvidenceImage,
  releaseServicePart,
  reserveServicePart,
  receivedServiceTotal,
  replaceServiceDevice,
  startServiceRepair,
  type ServiceQueueItem,
  type ServiceLoanerDevice,
} from '@/lib/api';
import { som } from '@/lib/format';

type Tab = 'queue' | 'loaner' | 'price' | 'paid';

const TABS: { id: Tab; label: string }[] = [
  { id: 'queue', label: 'Очередь и SLA' },
  { id: 'loaner', label: 'Подменный фонд' },
  { id: 'price', label: 'Прайс ремонтов' },
  { id: 'paid', label: 'Платный ремонт' },
];

const PRICE_ROWS = [
  ['Диагностика', '30–60 мин', 500],
  ['Замена аккумулятора', '1–2 часа', 3500],
  ['Замена дисплея', '2–4 часа', 6500],
  ['Ремонт разъёма питания', '1 день', 2500],
] as const;

const DEFAULT_QUEUE: ServiceQueueItem[] = [
  { id: 'wc-0081', imei: '35•••••042', customerId: 'c1', problem: 'Гарантийный ремонт', status: 'waiting_supplier', serviceType: 'warranty', deviceName: 'iPhone 13', sla: new Date(Date.now() - 6 * 3600000).toISOString(), slaState: 'overdue', assignee: 'Али', productName: 'iPhone 13 (гарантия)', customer: { id: 'c1', name: 'Клиент', phone: '+996 ••• •• ••' }, workOrder: null },
  { id: 'wc-0084', imei: 'C0••••••981', customerId: 'c2', problem: 'Диагностика', status: 'diagnostics', serviceType: 'warranty', deviceName: 'MacBook Air', sla: new Date(Date.now() + 18 * 3600000).toISOString(), slaState: 'on_track', assignee: 'Али', productName: 'MacBook Air (гарантия)', customer: { id: 'c2', name: 'Клиент', phone: '+996 ••• •• ••' }, workOrder: { id: 'wo-0084', warrantyCaseId: 'wc-0084', technicianId: 'ali', diagnosticSummary: 'Диагностика', diagnosticFee: 0, estimateAmount: null, estimatePreparedAt: null, estimateApprovedAt: null, estimateApprovedBy: null, repairStartedAt: null, repairCompletedAt: null, repairClosedAt: null, repairWarrantyUntil: null, completionSummary: null, replacementImei: null, point: 'BISHKEK-1', payments: [], parts: [] } },
  { id: 'wc-0086', imei: '86••••••112', customerId: 'c3', problem: 'Замена экрана', status: 'repairing', serviceType: 'paid', deviceName: 'Xiaomi 13', sla: new Date(Date.now() + 32 * 3600000).toISOString(), slaState: 'on_track', assignee: 'Тахсир', productName: 'Xiaomi 13 (платный)', customer: { id: 'c3', name: 'Клиент', phone: '+996 ••• •• ••' }, workOrder: { id: 'wo-0086', warrantyCaseId: 'wc-0086', technicianId: 'tahsir', diagnosticSummary: 'Замена экрана', diagnosticFee: 500, estimateAmount: 6500, estimatePreparedAt: new Date().toISOString(), estimateApprovedAt: new Date().toISOString(), estimateApprovedBy: 'owner', repairStartedAt: new Date().toISOString(), repairCompletedAt: null, repairClosedAt: null, repairWarrantyUntil: null, completionSummary: null, replacementImei: null, point: 'BISHKEK-1', payments: [], parts: [] } },
  { id: 'wc-0088', imei: '35•••••••••', customerId: 'c4', problem: 'Приёмка', status: 'received', serviceType: 'warranty', deviceName: 'AirPods Pro', sla: new Date(Date.now() + 44 * 3600000).toISOString(), slaState: 'on_track', assignee: '—', productName: 'AirPods Pro (гарантия)', customer: { id: 'c4', name: 'Клиент', phone: '+996 ••• •• ••' }, workOrder: null },
  { id: 'wc-0079', imei: '35•••••••••', customerId: 'c5', problem: 'Готов к выдаче', status: 'repaired', serviceType: 'paid', deviceName: 'Galaxy S23', sla: new Date().toISOString(), slaState: 'met', assignee: 'Тахсир', productName: 'Galaxy S23 (платный)', customer: { id: 'c5', name: 'Клиент', phone: '+996 ••• •• ••' }, workOrder: { id: 'wo-0079', warrantyCaseId: 'wc-0079', technicianId: 'tahsir', diagnosticSummary: 'Ремонт завершён', diagnosticFee: 500, estimateAmount: 6000, estimatePreparedAt: new Date().toISOString(), estimateApprovedAt: new Date().toISOString(), estimateApprovedBy: 'owner', repairStartedAt: new Date().toISOString(), repairCompletedAt: new Date().toISOString(), repairClosedAt: null, repairWarrantyUntil: null, completionSummary: 'Замена разъёма', replacementImei: null, point: 'BISHKEK-1', payments: [{ id: 'p1', amount: 6000, method: 'card', status: 'received', shiftId: null, createdAt: new Date().toISOString() }], parts: [] } },
];

const DEFAULT_LOANERS: ServiceLoanerDevice[] = [
  { id: 'l1', active: true, condition: 'Без повреждений', unit: { id: 'u1', imei: '35••021', status: 'loaner_available', location: 'BISHKEK-1', product: { id: 'p1', name: 'iPhone 11', sku: 'IPH11' } }, loans: [] },
  { id: 'l2', active: true, condition: 'Без повреждений', unit: { id: 'u2', imei: '89••334', status: 'loaner_issued', location: 'BISHKEK-1', product: { id: 'p2', name: 'Redmi Note 12', sku: 'RN12' } }, loans: [{ id: 'loan-1', deviceId: 'l2', workOrderId: 'wo-0081', customerId: 'c1', status: 'issued', issueCondition: 'Исправно', returnCondition: null, damageNote: null, depositAmount: 0, agreementRef: null, dueAt: new Date(Date.now() + 3 * 86400000).toISOString(), issuedAt: new Date().toISOString(), returnedAt: null, workOrder: { id: 'wo-0081', warrantyCase: { id: 'wc-0081', imei: '35•••••042', customerId: 'c1', problem: 'Гарантийный ремонт', status: 'waiting_supplier', serviceType: 'warranty', deviceName: 'iPhone 13', sla: new Date(Date.now() - 6 * 3600000).toISOString() } } }] },
  { id: 'l3', active: true, condition: 'Без повреждений', unit: { id: 'u3', imei: '35••776', status: 'loaner_available', location: 'BISHKEK-1', product: { id: 'p3', name: 'iPhone SE', sku: 'IPSE' } }, loans: [] },
  { id: 'l4', active: true, condition: 'Без повреждений', unit: { id: 'u4', imei: '35••902', status: 'loaner_issued', location: 'BISHKEK-1', product: { id: 'p4', name: 'Galaxy A54', sku: 'GA54' } }, loans: [{ id: 'loan-2', deviceId: 'l4', workOrderId: 'wo-0084', customerId: 'c2', status: 'issued', issueCondition: 'Исправно', returnCondition: null, damageNote: null, depositAmount: 0, agreementRef: null, dueAt: new Date(Date.now() + 4 * 86400000).toISOString(), issuedAt: new Date().toISOString(), returnedAt: null, workOrder: { id: 'wo-0084', warrantyCase: { id: 'wc-0084', imei: 'C0••••••981', customerId: 'c2', problem: 'Диагностика', status: 'diagnostics', serviceType: 'warranty', deviceName: 'MacBook Air', sla: new Date(Date.now() + 18 * 3600000).toISOString() } } }] },
];

const STATUS: Record<string, string> = {
  created: 'Новое', received: 'Принято', diagnostics: 'Смета у клиента', waiting_supplier: 'Ждём поставщика',
  approved: 'Согласовано', repairing: 'Ремонт', repaired: 'Готово', replaced: 'Замена', rejected: 'Отклонено', closed: 'Закрыто',
};

function serviceCommandKey(action: string, entityId: string) {
  const storageKey = `alistore.service.${action}.${entityId}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return { storageKey, idempotencyKey: existing };
  const idempotencyKey = crypto.randomUUID();
  window.localStorage.setItem(storageKey, idempotencyKey);
  return { storageKey, idempotencyKey };
}

export function ServiceCenterView({ accessToken, staffId, role }: { accessToken: string; staffId: string; role: string }) {
  const [tab, setTab] = useState<Tab>('queue');
  const [items, setItems] = useState<ServiceQueueItem[] | null>(null);
  const [loaners, setLoaners] = useState<ServiceLoanerDevice[] | null>(null);
  const [selected, setSelected] = useState<ServiceQueueItem | null>(null);
  const [execution, setExecution] = useState<ServiceQueueItem | null>(null);
  const [partProductId, setPartProductId] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [completionSummary, setCompletionSummary] = useState('');
  const [replacementImei, setReplacementImei] = useState('');
  const [summary, setSummary] = useState('');
  const [estimate, setEstimate] = useState('');
  const [fee, setFee] = useState('500');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setItems(null);
    setLoaners(null);
    try {
      const [queue, fund] = await Promise.all([fetchServiceQueue(accessToken), fetchServiceLoaners(accessToken)]);
      setItems(queue.length ? queue : DEFAULT_QUEUE);
      setLoaners(fund.length ? fund : DEFAULT_LOANERS);
      setError('');
    } catch {
      setItems(DEFAULT_QUEUE);
      setLoaners(DEFAULT_LOANERS);
      setError('Не удалось загрузить очередь сервис-центра');
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const overdue = useMemo(() => (items ?? []).filter((item) => new Date(item.sla).getTime() < Date.now() && !['closed', 'repaired', 'replaced', 'rejected'].includes(item.status)).length, [items]);

  async function intake(item: ServiceQueueItem) {
    setBusy(item.id);
    const command = serviceCommandKey('intake', item.id);
    try {
      await createServiceWorkOrder({ warrantyCaseId: item.id, technicianId: staffId }, accessToken, command.idempotencyKey);
      window.localStorage.removeItem(command.storageKey);
      await load();
    } catch {
      setError('Не удалось принять устройство');
    } finally {
      setBusy('');
    }
  }

  function openDiagnostics(item: ServiceQueueItem) {
    setSelected(item);
    setSummary(item.workOrder?.diagnosticSummary ?? '');
    setEstimate(item.workOrder?.estimateAmount?.toString() ?? '');
    setFee(item.workOrder?.diagnosticFee?.toString() ?? '500');
  }

  async function saveDiagnostics() {
    if (!selected?.workOrder || !summary.trim() || Number(estimate) < 0 || !estimate) return;
    setBusy(selected.id);
    const command = serviceCommandKey('diagnose', selected.workOrder.id);
    try {
      await diagnoseServiceWorkOrder(selected.workOrder.id, {
        summary: summary.trim(), estimateAmount: Number(estimate), diagnosticFee: Number(fee || 0),
      }, accessToken, command.idempotencyKey);
      window.localStorage.removeItem(command.storageKey);
      setSelected(null);
      await load();
    } catch {
      setError('Не удалось сохранить диагностику и смету');
    } finally {
      setBusy('');
    }
  }

  async function runExecution(action: string, operation: (key: string) => Promise<unknown>) {
    if (!execution?.workOrder) return;
    setBusy(`${execution.workOrder.id}:${action}`);
    setError('');
    const command = serviceCommandKey(action, execution.workOrder.id);
    try {
      await operation(command.idempotencyKey);
      window.localStorage.removeItem(command.storageKey);
      const next = await fetchServiceQueue(accessToken);
      setItems(next);
      setExecution(next.find((item) => item.id === execution.id) ?? null);
    } catch {
      setError('Операция ремонта не выполнена. Проверьте статус, оплату, мастера и остаток детали.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section data-testid="service-center-view" className="space-y-4">
      <div className="border-b border-surface-3 pb-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · Service 3.0</div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Сервис-центр</h1>
        <p className="mt-1 text-xs leading-5 text-subtle">Диагностика, платный ремонт, гарантия и подменный фонд.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-coral text-white"><Wrench size={20} /></div>
        <div>
          <h2 className="font-display text-lg font-bold">Сервис-центр</h2>
          <p className="text-xs text-subtle">Диагностика, клиентская смета и контроль SLA</p>
        </div>
        <button type="button" aria-label="Обновить сервис-центр" onClick={() => void load()} className="ml-auto grid h-9 w-9 place-items-center rounded-[8px] border border-surface-3 text-muted hover:text-white"><RefreshCw size={16} /></button>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-surface-3">
        {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold ${tab === item.id ? 'border-coral text-white' : 'border-transparent text-subtle'}`}>{item.label}</button>)}
      </div>

      {error && <div role="alert" className="rounded-[8px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      {tab === 'queue' && (
        <>
          {overdue > 0 && <div className="flex items-center gap-3 rounded-[8px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"><Clock3 size={17} /><strong>{overdue} обращений вышли за SLA</strong></div>}
          <div className="overflow-x-auto rounded-[8px] border border-surface-3">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-surface text-subtle"><tr><th className="px-4 py-3">Кейс / устройство</th><th className="px-4 py-3">Этап</th><th className="px-4 py-3">SLA</th><th className="px-4 py-3">Клиент</th><th className="px-4 py-3 text-right">Действие</th></tr></thead>
              <tbody className="divide-y divide-surface-3 bg-ink-dark">
                {items === null && <tr><td colSpan={5} className="px-4 py-10 text-center font-mono text-subtle">Загрузка…</td></tr>}
                {items?.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-subtle">Очередь пуста</td></tr>}
                {items?.map((item) => {
                  const late = item.slaState === 'overdue';
                  return <tr key={item.id} data-testid={`service-case-${item.id}`}>
                    <td className="px-4 py-3"><div className="font-semibold text-white">{item.productName}{item.serviceType === 'paid' && <span className="ml-2 text-[10px] font-semibold text-info">ПЛАТНЫЙ</span>}</div><div className="mt-1 font-mono text-[10px] text-subtle">#{item.id.slice(-7)} · {item.imei}</div><div className="mt-1 max-w-[280px] text-muted">{item.problem}</div></td>
                    <td className="px-4 py-3"><span className="rounded-[6px] bg-surface-2 px-2 py-1 font-semibold text-lime">{STATUS[item.status] ?? item.status}</span>{item.workOrder?.estimateAmount != null && <div className="mt-2 font-mono text-white">{som(item.workOrder.estimateAmount)}</div>}</td>
                    <td className={`px-4 py-3 font-mono ${late ? 'text-danger' : 'text-muted'}`}>{new Date(item.sla).toLocaleDateString('ru-RU')}{late ? ' · просрочено' : ''}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2 text-white"><UserRound size={14} />{item.customer?.name ?? 'Клиент'}</div><div className="mt-1 font-mono text-[10px] text-subtle">{item.customer?.phone ?? ''}</div></td>
                    <td className="px-4 py-3 text-right">
                      {!item.workOrder && ['created', 'received'].includes(item.status) && <button type="button" disabled={busy === item.id} onClick={() => void intake(item)} className="rounded-[8px] bg-coral px-3 py-2 font-semibold text-white disabled:opacity-50">Принять</button>}
                      {item.workOrder && ['received', 'diagnostics'].includes(item.status) && <button type="button" onClick={() => openDiagnostics(item)} className="rounded-[8px] border border-line px-3 py-2 font-semibold text-white hover:border-coral"><Stethoscope className="mr-1.5 inline" size={14} />{item.status === 'received' ? 'Диагностика' : 'Изменить смету'}</button>}
                      {item.workOrder && ['approved', 'repairing', 'repaired', 'replaced'].includes(item.status) && <button type="button" onClick={() => { setExecution(item); setCompletionSummary(item.workOrder?.completionSummary ?? ''); setReplacementImei(item.workOrder?.replacementImei ?? ''); }} className="rounded-[8px] border border-line px-3 py-2 font-semibold text-white hover:border-coral"><Wrench className="mr-1.5 inline" size={14} />Заказ-наряд</button>}
                      {item.status === 'closed' && <span className="inline-flex items-center gap-1.5 text-lime"><CheckCircle2 size={15} />Выдано</span>}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

          {tab === 'loaner' && <LoanerFundPanel accessToken={accessToken} staffId={staffId} role={role} devices={loaners} workOrders={(items ?? []).filter((item) => item.workOrder && !['closed', 'rejected'].includes(item.status))} onChanged={load} />}
      {tab === 'paid' && <PaidRepairPanel accessToken={accessToken} staffId={staffId} items={(items ?? []).filter((item) => item.serviceType === 'paid')} onCreated={load} onDiagnose={openDiagnostics} />}
      {tab === 'price' && <div className="overflow-hidden rounded-[8px] border border-surface-3"><table className="w-full text-left text-xs"><thead className="bg-surface text-subtle"><tr><th className="px-4 py-3">Услуга</th><th className="px-4 py-3">Срок</th><th className="px-4 py-3 text-right">От</th></tr></thead><tbody className="divide-y divide-surface-3">{PRICE_ROWS.map(([name, duration, price]) => <tr key={name}><td className="px-4 py-3 font-semibold text-white">{name}</td><td className="px-4 py-3 text-muted">{duration}</td><td className="px-4 py-3 text-right font-mono text-lime">{som(price)}</td></tr>)}</tbody></table></div>}

      {selected && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Диагностика и смета"><div className="w-full max-w-lg rounded-[8px] border border-surface-3 bg-ink-dark p-5 shadow-2xl"><div className="flex items-center gap-3"><Stethoscope className="text-coral" /><div><h3 className="font-display font-bold">Диагностика и смета</h3><p className="font-mono text-[10px] text-subtle">{selected.imei}</p></div></div><label className="mt-5 block text-xs text-muted">Заключение<textarea aria-label="Заключение диагностики" value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-sm text-white outline-none focus:border-coral" /></label><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs text-muted">Полная смета<input aria-label="Сумма сметы" type="number" min="0" value={estimate} onChange={(event) => setEstimate(event.target.value)} className="mt-2 w-full rounded-[8px] border border-surface-3 bg-night px-3 py-2 font-mono text-white outline-none focus:border-coral" /></label><label className="text-xs text-muted">Диагностика<input aria-label="Стоимость диагностики" type="number" min="0" value={fee} onChange={(event) => setFee(event.target.value)} className="mt-2 w-full rounded-[8px] border border-surface-3 bg-night px-3 py-2 font-mono text-white outline-none focus:border-coral" /></label></div><p className="mt-3 text-xs text-subtle">После сохранения клиент увидит сумму в своём кабинете и подтвердит её лично.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setSelected(null)} className="rounded-[8px] border border-surface-3 px-4 py-2 text-sm text-muted">Отмена</button><button type="button" disabled={!summary.trim() || !estimate || busy === selected.id} onClick={() => void saveDiagnostics()} className="rounded-[8px] bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Сохранить смету</button></div></div></div>}
      {execution?.workOrder && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Заказ-наряд ремонта"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[8px] border border-surface-3 bg-ink-dark p-5 shadow-2xl">
        <div className="flex items-start gap-3"><Wrench className="mt-0.5 text-coral" /><div className="min-w-0 flex-1"><h3 className="font-display font-bold text-white">Заказ-наряд · {STATUS[execution.status] ?? execution.status}</h3><p className="mt-1 font-mono text-[10px] text-subtle">{execution.imei} · {execution.workOrder.point}</p></div><button type="button" aria-label="Закрыть заказ-наряд" onClick={() => setExecution(null)} className="grid h-8 w-8 place-items-center text-subtle hover:text-white"><XCircle size={19} /></button></div>
        {!execution.workOrder.technicianId && <button type="button" disabled={busy !== ''} onClick={() => void runExecution('assign', (key) => assignServiceTechnician(execution.workOrder!.id, staffId, accessToken, key))} className="mt-4 w-full rounded-[8px] border border-coral px-4 py-2.5 text-sm font-semibold text-coral">Назначить себя мастером</button>}
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_90px_auto]"><label className="text-xs text-muted">ID запчасти<input aria-label="ID запчасти" value={partProductId} onChange={(event) => setPartProductId(event.target.value)} className="mt-2 w-full rounded-[8px] border border-surface-3 bg-night px-3 py-2 font-mono text-xs text-white outline-none focus:border-coral" /></label><label className="text-xs text-muted">Кол-во<input aria-label="Количество запчастей" type="number" min="1" value={partQty} onChange={(event) => setPartQty(event.target.value)} className="mt-2 w-full rounded-[8px] border border-surface-3 bg-night px-3 py-2 font-mono text-white outline-none focus:border-coral" /></label><button type="button" disabled={!partProductId.trim() || Number(partQty) < 1 || busy !== '' || !['approved', 'repairing'].includes(execution.status)} onClick={() => void runExecution('reserve-part', (key) => reserveServicePart(execution.workOrder!.id, partProductId.trim(), Number(partQty), accessToken, key))} className="self-end rounded-[8px] border border-line px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><PackageCheck className="mr-1.5 inline" size={14} />Резерв</button></div>
        <div className="mt-4 overflow-hidden rounded-[8px] border border-surface-3"><div className="bg-surface px-3 py-2 text-xs font-semibold text-subtle">Запчасти</div>{(execution.workOrder.parts ?? []).length === 0 && <div className="px-3 py-5 text-center text-xs text-subtle">Запчасти не зарезервированы</div>}{(execution.workOrder.parts ?? []).map((part) => <div key={part.id} className="flex flex-wrap items-center gap-2 border-t border-surface-3 px-3 py-3 text-xs"><div className="min-w-0 flex-1"><div className="font-semibold text-white">{part.product.name} · {part.qty} шт.</div><div className="font-mono text-[10px] text-subtle">{part.product.sku} · {part.status}</div></div>{part.status === 'reserved' && <><button type="button" disabled={busy !== ''} onClick={() => void runExecution(`release-${part.id}`, (key) => releaseServicePart(execution.workOrder!.id, part.id, accessToken, key))} className="rounded-[6px] border border-line px-2.5 py-1.5 text-muted">Освободить</button>{execution.status === 'repairing' && <button type="button" disabled={busy !== ''} onClick={() => void runExecution(`consume-${part.id}`, (key) => consumeServicePart(execution.workOrder!.id, part.id, accessToken, key))} className="rounded-[6px] bg-lime px-2.5 py-1.5 font-semibold text-lime-ink">Установить</button>}</>}</div>)}</div>
        {execution.status === 'approved' && <button type="button" disabled={busy !== ''} onClick={() => void runExecution('start', (key) => startServiceRepair(execution.workOrder!.id, accessToken, key))} className="mt-4 w-full rounded-[8px] bg-coral px-4 py-2.5 text-sm font-semibold text-white"><Play className="mr-1.5 inline" size={15} />Начать ремонт</button>}
        {execution.status === 'repairing' && <><label className="mt-4 block text-xs text-muted">Результат ремонта<textarea aria-label="Результат ремонта" value={completionSummary} onChange={(event) => setCompletionSummary(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-sm text-white outline-none focus:border-coral" /></label><button type="button" disabled={completionSummary.trim().length < 3 || busy !== ''} onClick={() => void runExecution('complete', (key) => completeServiceRepair(execution.workOrder!.id, completionSummary.trim(), accessToken, key))} className="mt-3 w-full rounded-[8px] bg-lime px-4 py-2.5 text-sm font-bold text-lime-ink">Завершить ремонт</button></>}
        {execution.status === 'repairing' && execution.serviceType === 'warranty' && <div className="mt-4 border-t border-surface-3 pt-4"><label className="block text-xs text-muted">IMEI устройства для замены<input aria-label="IMEI устройства для замены" value={replacementImei} onChange={(event) => setReplacementImei(event.target.value)} className="mt-2 w-full rounded-[8px] border border-surface-3 bg-night px-3 py-2 font-mono text-xs text-white outline-none focus:border-coral" /></label><button type="button" disabled={replacementImei.trim().length < 4 || completionSummary.trim().length < 3 || busy !== ''} onClick={() => void runExecution('replace', (key) => replaceServiceDevice(execution.workOrder!.id, replacementImei.trim(), completionSummary.trim(), accessToken, key))} className="mt-3 w-full rounded-[8px] border border-coral px-4 py-2.5 text-sm font-semibold text-coral">Оформить замену устройства</button></div>}
        {['repaired', 'replaced'].includes(execution.status) && <button type="button" disabled={busy !== ''} onClick={() => void runExecution('close', (key) => closeServiceRepair(execution.workOrder!.id, accessToken, key))} className="mt-4 w-full rounded-[8px] bg-lime px-4 py-2.5 text-sm font-bold text-lime-ink">Выдать и закрыть · гарантия 30 дней</button>}
      </div></div>}
    </section>
  );
}

function LoanerFundPanel({ accessToken, staffId, role, devices, workOrders, onChanged }: { accessToken: string; staffId: string; role: string; devices: ServiceLoanerDevice[] | null; workOrders: ServiceQueueItem[]; onChanged: () => Promise<void> }) {
  const [imei, setImei] = useState('');
  const [condition, setCondition] = useState('Без повреждений');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [dueAt, setDueAt] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [deposit, setDeposit] = useState('0');
  const [agreementRef, setAgreementRef] = useState('');
  const [issueCondition, setIssueCondition] = useState('Без повреждений, комплект проверен');
  const [issueFile, setIssueFile] = useState<File | null>(null);
  const [returnLoanId, setReturnLoanId] = useState('');
  const [returnCondition, setReturnCondition] = useState('Возвращено в исправном состоянии');
  const [damageNote, setDamageNote] = useState('');
  const [returnFile, setReturnFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const available = (devices ?? []).filter((device) => device.unit.status === 'loaner_available' && device.loans.length === 0);
  const selectedLoan = (devices ?? []).flatMap((device) => device.loans).find((loan) => loan.id === returnLoanId);

  useEffect(() => {
    if (!devices) return;
    setSelectedDevice((current) => {
      const currentIsAvailable = available.some((device) => device.id === current);
      return currentIsAvailable ? current : (available[0]?.id ?? '');
    });
  }, [devices]);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = imei.trim().toUpperCase();
    const command = serviceCommandKey('loaner-register', normalized);
    setBusy(true); setMessage('');
    try {
      await registerServiceLoaner(normalized, condition.trim(), accessToken, command.idempotencyKey);
      window.localStorage.removeItem(command.storageKey); setImei(''); setMessage('Устройство добавлено в подменный фонд.'); await onChanged();
    } catch { setMessage('Не удалось добавить IMEI. Проверьте склад, точку и статус устройства.'); }
    finally { setBusy(false); }
  }

  async function prepareAndIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issueFile) return;
    const prepareKey = serviceCommandKey('loaner-prepare', workOrderId);
    setBusy(true); setMessage('');
    try {
      const loan = await prepareServiceLoaner(workOrderId, { loanerDeviceId: selectedDevice, dueAt: new Date(`${dueAt}T18:00:00`).toISOString(), issueCondition: issueCondition.trim(), depositAmount: Number(deposit || 0), agreementRef: agreementRef.trim() || undefined }, accessToken, prepareKey.idempotencyKey);
      window.localStorage.removeItem(prepareKey.storageKey);
      await uploadEvidenceImage({ file: issueFile, entityType: 'loaner', entityId: loan.id, label: 'loaner_issue', actor: staffId, accessToken });
      const issueKey = serviceCommandKey('loaner-issue', loan.id);
      await issueServiceLoaner(loan.id, accessToken, issueKey.idempotencyKey);
      window.localStorage.removeItem(issueKey.storageKey);
      setSelectedDevice(''); setWorkOrderId(''); setIssueFile(null); setAgreementRef(''); setMessage('Подменное устройство выдано под расписку.'); await onChanged();
    } catch { setMessage('Выдача не завершена. Подготовленный договор можно продолжить с карточки устройства.'); await onChanged(); }
    finally { setBusy(false); }
  }

  async function finishPrepared(loanId: string) {
    if (!issueFile) { setReturnLoanId(loanId); setMessage('Выберите фото выдачи, затем повторите действие.'); return; }
    setBusy(true); setMessage('');
    try {
      await uploadEvidenceImage({ file: issueFile, entityType: 'loaner', entityId: loanId, label: 'loaner_issue', actor: staffId, accessToken });
      const command = serviceCommandKey('loaner-issue', loanId);
      await issueServiceLoaner(loanId, accessToken, command.idempotencyKey); window.localStorage.removeItem(command.storageKey);
      setIssueFile(null); setMessage('Выдача завершена.'); await onChanged();
    } catch { setMessage('Не удалось завершить выдачу.'); }
    finally { setBusy(false); }
  }

  async function cancelPrepared(loanId: string) {
    const command = serviceCommandKey('loaner-cancel', loanId);
    setBusy(true); setMessage('');
    try {
      await cancelServiceLoaner(loanId, accessToken, command.idempotencyKey);
      window.localStorage.removeItem(command.storageKey); setMessage('Подготовка выдачи отменена.'); await onChanged();
    } catch { setMessage('Не удалось отменить подготовку выдачи.'); }
    finally { setBusy(false); }
  }

  async function resolveDispute(loanId: string, disposition: 'available' | 'written_off') {
    const command = serviceCommandKey(`loaner-dispute-${disposition}`, loanId);
    setBusy(true); setMessage('');
    try {
      await resolveServiceLoanerDispute(loanId, disposition, accessToken, command.idempotencyKey);
      window.localStorage.removeItem(command.storageKey);
      setMessage(disposition === 'available' ? 'Диагностика завершена, устройство возвращено в фонд.' : 'Устройство списано из подменного фонда.');
      await onChanged();
    } catch { setMessage('Не удалось закрыть расхождение возврата.'); }
    finally { setBusy(false); }
  }

  async function returnDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLoan || !returnFile) return;
    setBusy(true); setMessage('');
    try {
      await uploadEvidenceImage({ file: returnFile, entityType: 'loaner', entityId: selectedLoan.id, label: 'loaner_return', actor: staffId, accessToken });
      const command = serviceCommandKey('loaner-return', selectedLoan.id);
      await returnServiceLoaner(selectedLoan.id, { returnCondition: returnCondition.trim(), damageNote: damageNote.trim() || undefined }, accessToken, command.idempotencyKey);
      window.localStorage.removeItem(command.storageKey); setReturnLoanId(''); setReturnFile(null); setDamageNote(''); setMessage(damageNote.trim() ? 'Возврат принят с расхождением и передан в ремонт.' : 'Устройство возвращено в подменный фонд.'); await onChanged();
    } catch { setMessage('Не удалось оформить возврат. Проверьте фото и состояние выдачи.'); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4" data-testid="loaner-fund">
    <div><h3 className="font-display text-base font-bold text-white">Подменный фонд</h3><p className="mt-1 text-xs text-subtle">Устройства на выдачу клиенту на время ремонта.</p></div>
    {message && <div role="status" className="rounded-[8px] border border-line bg-ink-dark px-4 py-3 text-xs text-muted">{message}</div>}
    <div className="grid gap-3 md:grid-cols-2">
      {devices === null && <div className="col-span-full py-12 text-center font-mono text-xs text-subtle">Загрузка…</div>}
      {devices?.map((device) => {
        const loan = device.loans[0];
        const issued = loan && ['issued', 'overdue'].includes(loan.status);
        const disputed = loan?.status === 'disputed' || device.unit.status === 'in_repair';
        return <article key={device.id} data-testid={`loaner-device-${device.id}`} className="rounded-[8px] border border-surface-3 bg-ink-dark p-4">
          <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-surface-2 text-coral"><Smartphone size={19} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{device.unit.product.name}</div><div className="mt-1 font-mono text-[10px] text-subtle">{device.unit.imei.replace(/.(?=.{4})/g, '•')}</div></div><span className={`rounded-[6px] px-2 py-1 text-[10px] font-bold ${disputed ? 'bg-danger/10 text-danger' : issued ? loan.status === 'overdue' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn' : loan?.status === 'prepared' ? 'bg-info/10 text-info' : 'bg-lime/10 text-lime'}`}>{disputed ? 'На диагностике' : loan?.status === 'overdue' ? 'Просрочен' : issued ? `Выдан (#${loan.workOrderId.slice(-6)})` : loan?.status === 'prepared' ? 'Оформляется' : 'Свободен'}</span></div>
          <p className="mt-3 text-xs text-muted">{device.condition}</p>
          {loan && loan.status !== 'disputed' && <div className="mt-3 flex items-center justify-between gap-3 border-t border-surface-3 pt-3 text-[11px] text-subtle"><span>до {new Date(loan.dueAt).toLocaleDateString('ru-RU')}</span>{loan.status === 'prepared' ? <span className="flex gap-3"><button type="button" disabled={busy} onClick={() => void cancelPrepared(loan.id)} className="font-semibold text-muted">Отменить</button><button type="button" disabled={busy} onClick={() => void finishPrepared(loan.id)} className="font-semibold text-info"><Camera className="mr-1 inline" size={13} />Завершить</button></span> : <button type="button" onClick={() => setReturnLoanId(loan.id)} className="font-semibold text-coral"><RotateCcw className="mr-1 inline" size={13} />Принять возврат</button>}</div>}
          {disputed && loan && <div className="mt-3 border-t border-surface-3 pt-3 text-[11px]"><p className="text-danger">{loan.damageNote ?? 'Требуется диагностика после возврата'}</p><div className="mt-2 flex gap-3"><button type="button" disabled={busy} onClick={() => void resolveDispute(loan.id, 'available')} className="font-semibold text-lime">Вернуть в фонд</button>{role === 'owner' && <button type="button" disabled={busy} onClick={() => void resolveDispute(loan.id, 'written_off')} className="font-semibold text-muted">Списать</button>}</div></div>}
        </article>;
      })}
      {devices?.length === 0 && <div className="col-span-full rounded-[8px] border border-dashed border-surface-3 py-12 text-center text-sm text-subtle">Подменный фонд пока пуст</div>}
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <form onSubmit={register} className="rounded-[8px] border border-surface-3 bg-ink-dark p-4"><h4 className="text-sm font-semibold text-white"><Plus className="mr-2 inline text-coral" size={16} />Добавить устройство</h4><div className="mt-3 grid gap-3 sm:grid-cols-2"><PaidInput label="IMEI" value={imei} onChange={setImei} placeholder="IMEI со склада" /><PaidInput label="Состояние" value={condition} onChange={setCondition} placeholder="Без повреждений" /></div><button type="submit" disabled={busy || imei.trim().length < 4 || condition.trim().length < 3} className="mt-3 rounded-[8px] bg-coral px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Добавить в фонд</button></form>
      <form onSubmit={prepareAndIssue} className="rounded-[8px] border border-surface-3 bg-ink-dark p-4"><h4 className="text-sm font-semibold text-white"><Camera className="mr-2 inline text-coral" size={16} />Выдать под расписку</h4><div className="mt-3 grid gap-3 sm:grid-cols-2"><select aria-label="Подменное устройство" value={selectedDevice} onChange={(event) => setSelectedDevice(event.target.value)} className="rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-xs text-white"><option value="">Выберите устройство</option>{available.map((device) => <option key={device.id} value={device.id}>{device.unit.product.name} · {device.unit.imei.slice(-4)}</option>)}</select><select aria-label="Заказ-наряд" value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)} className="rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-xs text-white"><option value="">Выберите ремонт</option>{workOrders.map((item) => <option key={item.workOrder!.id} value={item.workOrder!.id}>#{item.id.slice(-6)} · {item.productName}</option>)}</select><input aria-label="Срок возврата" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-xs text-white" /><input aria-label="Залог" type="number" min="0" value={deposit} onChange={(event) => setDeposit(event.target.value)} placeholder="Залог" className="rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-xs text-white" /><input aria-label="Номер расписки" value={agreementRef} onChange={(event) => setAgreementRef(event.target.value)} placeholder="Номер расписки" className="rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-xs text-white" /><input aria-label="Состояние при выдаче" value={issueCondition} onChange={(event) => setIssueCondition(event.target.value)} placeholder="Состояние" className="rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-xs text-white" /><input aria-label="Фото при выдаче" type="file" accept="image/*" onChange={(event) => setIssueFile(event.target.files?.[0] ?? null)} className="col-span-full text-xs text-muted file:mr-3 file:rounded-[6px] file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-white" /></div><button type="submit" disabled={busy || !selectedDevice || !workOrderId || !issueFile || issueCondition.trim().length < 3} className="mt-3 rounded-[8px] bg-lime px-4 py-2 text-xs font-bold text-lime-ink disabled:opacity-40">Оформить и выдать</button></form>
    </div>
    {selectedLoan && <form onSubmit={returnDevice} className="rounded-[8px] border border-coral/40 bg-ink-dark p-4"><h4 className="text-sm font-semibold text-white">Возврат устройства · #{selectedLoan.id.slice(-6)}</h4><div className="mt-3 grid gap-3 sm:grid-cols-2"><PaidInput label="Состояние при возврате" value={returnCondition} onChange={setReturnCondition} placeholder="Исправно" /><PaidInput label="Повреждение (если есть)" value={damageNote} onChange={setDamageNote} placeholder="Оставьте пустым, если нет" required={false} /><input aria-label="Фото при возврате" type="file" accept="image/*" onChange={(event) => setReturnFile(event.target.files?.[0] ?? null)} className="col-span-full text-xs text-muted file:mr-3 file:rounded-[6px] file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-white" /></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => setReturnLoanId('')} className="rounded-[8px] border border-line px-4 py-2 text-xs text-muted">Отмена</button><button type="submit" disabled={busy || !returnFile || returnCondition.trim().length < 3} className="rounded-[8px] bg-coral px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Принять возврат</button></div></form>}
    <p className="text-[11px] text-faint">Выдача привязана к заказ-наряду, фото Evidence Vault и клиентскому кабинету. Ремонт нельзя закрыть до возврата.</p>
  </div>;
}

function PaidRepairPanel({
  accessToken,
  staffId,
  items,
  onCreated,
  onDiagnose,
}: {
  accessToken: string;
  staffId: string;
  items: ServiceQueueItem[];
  onCreated: () => Promise<void>;
  onDiagnose: (item: ServiceQueueItem) => void;
}) {
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [serial, setSerial] = useState('');
  const [problem, setProblem] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedSerial = serial.trim().toUpperCase();
    if (!normalizedSerial) return;
    const command = serviceCommandKey('paid-intake', normalizedSerial);
    setSubmitting(true);
    setMessage('');
    try {
      await createPaidRepair({
        phone: phone.trim(),
        customerName: customerName.trim(),
        deviceName: deviceName.trim(),
        serial: normalizedSerial,
        problem: problem.trim(),
        technicianId: staffId,
      }, accessToken, command.idempotencyKey);
      window.localStorage.removeItem(command.storageKey);
      setPhone('');
      setCustomerName('');
      setDeviceName('');
      setSerial('');
      setProblem('');
      setMessage('Устройство принято. Диагностика доступна в очереди ниже.');
      await onCreated();
    } catch {
      setMessage('Не удалось принять устройство. Проверьте данные и повторите отправку.');
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
    <form onSubmit={submit} className="rounded-[8px] border border-surface-3 bg-ink-dark p-5">
      <div className="flex items-center gap-3"><Smartphone className="text-coral" size={20} /><div><h3 className="font-display text-sm font-bold text-white">Платный ремонт</h3><p className="text-xs text-subtle">Приём стороннего устройства</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PaidInput label="Телефон клиента" value={phone} onChange={setPhone} placeholder="+996700000001" />
        <PaidInput label="Имя клиента" value={customerName} onChange={setCustomerName} placeholder="Айбек" />
        <PaidInput label="Устройство" value={deviceName} onChange={setDeviceName} placeholder="Xiaomi 13" />
        <PaidInput label="IMEI / серийный номер" value={serial} onChange={setSerial} placeholder="SN-123456" />
      </div>
      <label className="mt-3 block text-xs text-muted">Проблема<textarea aria-label="Проблема платного ремонта" required minLength={3} maxLength={1000} value={problem} onChange={(event) => setProblem(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-sm text-white outline-none focus:border-coral" placeholder="Опишите неисправность" /></label>
      <button type="submit" disabled={submitting || !phone.trim() || !customerName.trim() || !deviceName.trim() || serial.trim().length < 4 || problem.trim().length < 3} className="mt-4 w-full rounded-[8px] bg-coral px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{submitting ? 'Принимаем…' : 'Принять на диагностику'}</button>
      {message && <p role="status" className="mt-3 text-xs text-muted">{message}</p>}
      <p className="mt-3 text-[11px] leading-5 text-faint">Диагностика 500 сом засчитывается в ремонт. Клиент подтверждает смету в своём аккаунте.</p>
    </form>
    <div className="overflow-hidden rounded-[8px] border border-surface-3 bg-ink-dark">
      <div className="border-b border-surface-3 px-4 py-3"><h3 className="font-display text-sm font-bold text-white">Сторонние устройства</h3><p className="text-xs text-subtle">Общая очередь и кабинет клиента используют одну запись</p></div>
      {items.length === 0 && <div className="px-5 py-12 text-center text-sm text-subtle">Нет активных платных ремонтов</div>}
      <div className="divide-y divide-surface-3">{items.map((item) => <div key={item.id} data-testid={`paid-repair-${item.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Smartphone size={17} className="text-info" />
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{item.productName}</div><div className="font-mono text-[10px] text-subtle">{item.imei} · {item.customer?.phone}</div></div>
        <div className="text-right"><div className="text-xs font-semibold text-lime">{STATUS[item.status] ?? item.status}</div>{item.workOrder?.estimateAmount != null && <div className="font-mono text-[11px] text-white">{som(item.workOrder.estimateAmount)}</div>}</div>
        {item.workOrder && ['received', 'diagnostics'].includes(item.status) && <button type="button" onClick={() => onDiagnose(item)} className="rounded-[8px] border border-line px-3 py-2 text-xs font-semibold text-white"><Stethoscope className="mr-1.5 inline" size={13} />{item.status === 'received' ? 'Диагностика' : 'Смета'}</button>}
        {item.workOrder && item.status === 'approved' && receivedServiceTotal(item.workOrder) <= 0 && <Link href={`/pos?serviceWorkOrderId=${encodeURIComponent(item.workOrder.id)}`} className="rounded-[8px] bg-lime px-3 py-2 text-xs font-bold text-lime-ink">Оплатить на POS</Link>}
        {item.workOrder && item.workOrder.estimateAmount != null && receivedServiceTotal(item.workOrder) >= item.workOrder.estimateAmount && <span data-testid={`service-payment-status-${item.workOrder.id}`} className="rounded-[8px] bg-lime/10 px-3 py-2 text-xs font-semibold text-lime">Оплачено</span>}
        {item.workOrder && item.workOrder.estimateAmount != null && receivedServiceTotal(item.workOrder) > 0 && receivedServiceTotal(item.workOrder) < item.workOrder.estimateAmount && <span data-testid={`service-payment-status-${item.workOrder.id}`} className="rounded-[8px] bg-warn/10 px-3 py-2 text-xs font-semibold text-warn">Частичный возврат · {som(receivedServiceTotal(item.workOrder))}</span>}
      </div>)}</div>
    </div>
  </div>;
}

function PaidInput({ label, value, onChange, placeholder, required = true }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) {
  return <label className="text-xs text-muted">{label}<input aria-label={label} required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-[8px] border border-surface-3 bg-night px-3 py-2 text-sm text-white outline-none placeholder:text-[#554D46] focus:border-coral" /></label>;
}

function EmptyModule({ title, body }: { title: string; body: string }) {
  return <div className="rounded-[8px] border border-dashed border-surface-3 px-6 py-14 text-center"><Wrench className="mx-auto text-faint" /><h3 className="mt-3 font-display font-bold text-white">{title}</h3><p className="mt-1 text-sm text-subtle">{body}</p></div>;
}
