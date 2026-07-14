'use client';

import { CheckCircle2, Clock3, RefreshCw, Smartphone, Stethoscope, UserRound, Wrench } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPaidRepair,
  createServiceWorkOrder,
  diagnoseServiceWorkOrder,
  fetchServiceQueue,
  type ServiceQueueItem,
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

const STATUS: Record<string, string> = {
  created: 'Новое', received: 'Принято', diagnostics: 'Смета у клиента', waiting_supplier: 'Ждём поставщика',
  approved: 'В работе', repaired: 'Готово', replaced: 'Замена', rejected: 'Отклонено', closed: 'Закрыто',
};

function serviceCommandKey(action: string, entityId: string) {
  const storageKey = `alistore.service.${action}.${entityId}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return { storageKey, idempotencyKey: existing };
  const idempotencyKey = crypto.randomUUID();
  window.localStorage.setItem(storageKey, idempotencyKey);
  return { storageKey, idempotencyKey };
}

export function ServiceCenterView({ accessToken, staffId }: { accessToken: string; staffId: string }) {
  const [tab, setTab] = useState<Tab>('queue');
  const [items, setItems] = useState<ServiceQueueItem[] | null>(null);
  const [selected, setSelected] = useState<ServiceQueueItem | null>(null);
  const [summary, setSummary] = useState('');
  const [estimate, setEstimate] = useState('');
  const [fee, setFee] = useState('500');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setItems(null);
    try {
      setItems(await fetchServiceQueue(accessToken));
      setError('');
    } catch {
      setItems([]);
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

  return (
    <section data-testid="service-center-view" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-coral text-white"><Wrench size={20} /></div>
        <div>
          <h2 className="font-display text-lg font-bold">Сервис-центр</h2>
          <p className="text-xs text-[#8A7F76]">Диагностика, клиентская смета и контроль SLA</p>
        </div>
        <button type="button" aria-label="Обновить сервис-центр" onClick={() => void load()} className="ml-auto grid h-9 w-9 place-items-center rounded-[8px] border border-[#2E2822] text-[#A79C92] hover:text-white"><RefreshCw size={16} /></button>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-[#2E2822]">
        {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold ${tab === item.id ? 'border-coral text-white' : 'border-transparent text-[#8A7F76]'}`}>{item.label}</button>)}
      </div>

      {error && <div role="alert" className="rounded-[8px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      {tab === 'queue' && (
        <>
          {overdue > 0 && <div className="flex items-center gap-3 rounded-[8px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"><Clock3 size={17} /><strong>{overdue} обращений вышли за SLA</strong></div>}
          <div className="overflow-x-auto rounded-[8px] border border-[#2E2822]">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-[#1A1611] text-[#8A7F76]"><tr><th className="px-4 py-3">Кейс / устройство</th><th className="px-4 py-3">Этап</th><th className="px-4 py-3">SLA</th><th className="px-4 py-3">Клиент</th><th className="px-4 py-3 text-right">Действие</th></tr></thead>
              <tbody className="divide-y divide-[#2E2822] bg-[#16130F]">
                {items === null && <tr><td colSpan={5} className="px-4 py-10 text-center font-mono text-[#8A7F76]">Загрузка…</td></tr>}
                {items?.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-[#8A7F76]">Очередь пуста</td></tr>}
                {items?.map((item) => {
                  const late = new Date(item.sla).getTime() < Date.now();
                  return <tr key={item.id} data-testid={`service-case-${item.id}`}>
                    <td className="px-4 py-3"><div className="font-semibold text-white">{item.productName}{item.serviceType === 'paid' && <span className="ml-2 text-[10px] font-semibold text-[#7FB0EC]">ПЛАТНЫЙ</span>}</div><div className="mt-1 font-mono text-[10px] text-[#8A7F76]">#{item.id.slice(-7)} · {item.imei}</div><div className="mt-1 max-w-[280px] text-[#A79C92]">{item.problem}</div></td>
                    <td className="px-4 py-3"><span className="rounded-[6px] bg-[#221E19] px-2 py-1 font-semibold text-lime">{STATUS[item.status] ?? item.status}</span>{item.workOrder?.estimateAmount != null && <div className="mt-2 font-mono text-white">{som(item.workOrder.estimateAmount)}</div>}</td>
                    <td className={`px-4 py-3 font-mono ${late ? 'text-danger' : 'text-[#A79C92]'}`}>{new Date(item.sla).toLocaleDateString('ru-RU')}{late ? ' · просрочено' : ''}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2 text-white"><UserRound size={14} />{item.customer?.name ?? 'Клиент'}</div><div className="mt-1 font-mono text-[10px] text-[#8A7F76]">{item.customer?.phone ?? ''}</div></td>
                    <td className="px-4 py-3 text-right">
                      {!item.workOrder && ['created', 'received'].includes(item.status) && <button type="button" disabled={busy === item.id} onClick={() => void intake(item)} className="rounded-[8px] bg-coral px-3 py-2 font-semibold text-white disabled:opacity-50">Принять</button>}
                      {item.workOrder && ['received', 'diagnostics'].includes(item.status) && <button type="button" onClick={() => openDiagnostics(item)} className="rounded-[8px] border border-[#3B342D] px-3 py-2 font-semibold text-white hover:border-coral"><Stethoscope className="mr-1.5 inline" size={14} />{item.status === 'received' ? 'Диагностика' : 'Изменить смету'}</button>}
                      {item.status === 'approved' && <span className="inline-flex items-center gap-1.5 text-lime"><CheckCircle2 size={15} />Смета принята</span>}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'loaner' && <EmptyModule title="Подменный фонд" body="Нет выданных подменных устройств." />}
      {tab === 'paid' && <PaidRepairPanel accessToken={accessToken} staffId={staffId} items={(items ?? []).filter((item) => item.serviceType === 'paid')} onCreated={load} onDiagnose={openDiagnostics} />}
      {tab === 'price' && <div className="overflow-hidden rounded-[8px] border border-[#2E2822]"><table className="w-full text-left text-xs"><thead className="bg-[#1A1611] text-[#8A7F76]"><tr><th className="px-4 py-3">Услуга</th><th className="px-4 py-3">Срок</th><th className="px-4 py-3 text-right">От</th></tr></thead><tbody className="divide-y divide-[#2E2822]">{PRICE_ROWS.map(([name, duration, price]) => <tr key={name}><td className="px-4 py-3 font-semibold text-white">{name}</td><td className="px-4 py-3 text-[#A79C92]">{duration}</td><td className="px-4 py-3 text-right font-mono text-lime">{som(price)}</td></tr>)}</tbody></table></div>}

      {selected && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Диагностика и смета"><div className="w-full max-w-lg rounded-[8px] border border-[#2E2822] bg-[#16130F] p-5 shadow-2xl"><div className="flex items-center gap-3"><Stethoscope className="text-coral" /><div><h3 className="font-display font-bold">Диагностика и смета</h3><p className="font-mono text-[10px] text-[#8A7F76]">{selected.imei}</p></div></div><label className="mt-5 block text-xs text-[#A79C92]">Заключение<textarea aria-label="Заключение диагностики" value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-[8px] border border-[#2E2822] bg-[#0E0C0A] px-3 py-2 text-sm text-white outline-none focus:border-coral" /></label><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs text-[#A79C92]">Полная смета<input aria-label="Сумма сметы" type="number" min="0" value={estimate} onChange={(event) => setEstimate(event.target.value)} className="mt-2 w-full rounded-[8px] border border-[#2E2822] bg-[#0E0C0A] px-3 py-2 font-mono text-white outline-none focus:border-coral" /></label><label className="text-xs text-[#A79C92]">Диагностика<input aria-label="Стоимость диагностики" type="number" min="0" value={fee} onChange={(event) => setFee(event.target.value)} className="mt-2 w-full rounded-[8px] border border-[#2E2822] bg-[#0E0C0A] px-3 py-2 font-mono text-white outline-none focus:border-coral" /></label></div><p className="mt-3 text-xs text-[#8A7F76]">После сохранения клиент увидит сумму в своём кабинете и подтвердит её лично.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setSelected(null)} className="rounded-[8px] border border-[#2E2822] px-4 py-2 text-sm text-[#A79C92]">Отмена</button><button type="button" disabled={!summary.trim() || !estimate || busy === selected.id} onClick={() => void saveDiagnostics()} className="rounded-[8px] bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Сохранить смету</button></div></div></div>}
    </section>
  );
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
    <form onSubmit={submit} className="rounded-[8px] border border-[#2E2822] bg-[#16130F] p-5">
      <div className="flex items-center gap-3"><Smartphone className="text-coral" size={20} /><div><h3 className="font-display text-sm font-bold text-white">Платный ремонт</h3><p className="text-xs text-[#8A7F76]">Приём стороннего устройства</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PaidInput label="Телефон клиента" value={phone} onChange={setPhone} placeholder="+996700000001" />
        <PaidInput label="Имя клиента" value={customerName} onChange={setCustomerName} placeholder="Айбек" />
        <PaidInput label="Устройство" value={deviceName} onChange={setDeviceName} placeholder="Xiaomi 13" />
        <PaidInput label="IMEI / серийный номер" value={serial} onChange={setSerial} placeholder="SN-123456" />
      </div>
      <label className="mt-3 block text-xs text-[#A79C92]">Проблема<textarea aria-label="Проблема платного ремонта" required minLength={3} maxLength={1000} value={problem} onChange={(event) => setProblem(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-[8px] border border-[#2E2822] bg-[#0E0C0A] px-3 py-2 text-sm text-white outline-none focus:border-coral" placeholder="Опишите неисправность" /></label>
      <button type="submit" disabled={submitting || !phone.trim() || !customerName.trim() || !deviceName.trim() || serial.trim().length < 4 || problem.trim().length < 3} className="mt-4 w-full rounded-[8px] bg-coral px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{submitting ? 'Принимаем…' : 'Принять на диагностику'}</button>
      {message && <p role="status" className="mt-3 text-xs text-[#A79C92]">{message}</p>}
      <p className="mt-3 text-[11px] leading-5 text-[#6E645C]">Диагностика 500 сом засчитывается в ремонт. Клиент подтверждает смету в своём аккаунте.</p>
    </form>
    <div className="overflow-hidden rounded-[8px] border border-[#2E2822] bg-[#16130F]">
      <div className="border-b border-[#2E2822] px-4 py-3"><h3 className="font-display text-sm font-bold text-white">Сторонние устройства</h3><p className="text-xs text-[#8A7F76]">Общая очередь и кабинет клиента используют одну запись</p></div>
      {items.length === 0 && <div className="px-5 py-12 text-center text-sm text-[#8A7F76]">Нет активных платных ремонтов</div>}
      <div className="divide-y divide-[#2E2822]">{items.map((item) => <div key={item.id} data-testid={`paid-repair-${item.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Smartphone size={17} className="text-[#7FB0EC]" />
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{item.productName}</div><div className="font-mono text-[10px] text-[#8A7F76]">{item.imei} · {item.customer?.phone}</div></div>
        <div className="text-right"><div className="text-xs font-semibold text-lime">{STATUS[item.status] ?? item.status}</div>{item.workOrder?.estimateAmount != null && <div className="font-mono text-[11px] text-white">{som(item.workOrder.estimateAmount)}</div>}</div>
        {item.workOrder && ['received', 'diagnostics'].includes(item.status) && <button type="button" onClick={() => onDiagnose(item)} className="rounded-[8px] border border-[#3B342D] px-3 py-2 text-xs font-semibold text-white"><Stethoscope className="mr-1.5 inline" size={13} />{item.status === 'received' ? 'Диагностика' : 'Смета'}</button>}
      </div>)}</div>
    </div>
  </div>;
}

function PaidInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="text-xs text-[#A79C92]">{label}<input aria-label={label} required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-[8px] border border-[#2E2822] bg-[#0E0C0A] px-3 py-2 text-sm text-white outline-none placeholder:text-[#554D46] focus:border-coral" /></label>;
}

function EmptyModule({ title, body }: { title: string; body: string }) {
  return <div className="rounded-[8px] border border-dashed border-[#2E2822] px-6 py-14 text-center"><Wrench className="mx-auto text-[#6E645C]" /><h3 className="mt-3 font-display font-bold text-white">{title}</h3><p className="mt-1 text-sm text-[#8A7F76]">{body}</p></div>;
}
