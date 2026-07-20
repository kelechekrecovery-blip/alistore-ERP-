'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createCourierRun, createDeliverySlot, createDeliveryZone, createStorePoint, fetchLogisticsOverview, updateStorePoint, type LogisticsOverview } from '@/lib/api';
import { som } from '@/lib/format';

type Tab = 'zones' | 'pickup' | 'routes';
const TABS: { id: Tab; label: string }[] = [{ id: 'zones', label: 'Зоны и слоты' }, { id: 'pickup', label: 'Точки выдачи' }, { id: 'routes', label: 'Маршруты' }];
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bishkek',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
function localIso(date: string, clock: string) { return new Date(`${date}T${clock}:00+06:00`).toISOString(); }
function clock(value: string) { return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' }); }

const DEFAULT_DATE = today();
function slotIso(businessDate: string, clock: string) { return `${businessDate}T${clock}:00+06:00`; }

const DEFAULT_LOGISTICS: LogisticsOverview = {
  zones: [
    { id: 'z-center', code: 'center', name: 'Центр', fee: 0, etaMinMinutes: 60, etaMaxMinutes: 120, active: true, slots: [
      { id: 's-10-12', zoneId: 'z-center', startsAt: slotIso(DEFAULT_DATE, '10:00'), endsAt: slotIso(DEFAULT_DATE, '12:00'), capacity: 5, reserved: 2, remaining: 3, available: true },
      { id: 's-18-20', zoneId: 'z-center', startsAt: slotIso(DEFAULT_DATE, '18:00'), endsAt: slotIso(DEFAULT_DATE, '20:00'), capacity: 5, reserved: 3, remaining: 2, available: true },
    ] },
    { id: 'z-sleep', code: 'sleep', name: 'Спальные районы', fee: 300, etaMinMinutes: 120, etaMaxMinutes: 240, active: true, slots: [
      { id: 's-12-14', zoneId: 'z-sleep', startsAt: slotIso(DEFAULT_DATE, '12:00'), endsAt: slotIso(DEFAULT_DATE, '14:00'), capacity: 6, reserved: 4, remaining: 2, available: true },
    ] },
    { id: 'z-suburb', code: 'suburb', name: 'Пригород', fee: 500, etaMinMinutes: 180, etaMaxMinutes: 360, active: true, slots: [
      { id: 's-14-16', zoneId: 'z-suburb', startsAt: slotIso(DEFAULT_DATE, '14:00'), endsAt: slotIso(DEFAULT_DATE, '16:00'), capacity: 4, reserved: 4, remaining: 0, available: false },
    ] },
    { id: 'z-region', code: 'region', name: 'Регионы', fee: 0, etaMinMinutes: 1440, etaMaxMinutes: 4320, active: true, slots: [] },
  ],
  couriers: [
    { id: 'c-daniyar', username: 'Данияр', role: 'courier' },
    { id: 'c-azamat', username: 'Азамат', role: 'courier' },
  ],
  pendingOrders: [
    { id: 'o-4120', total: 42000, deliveryAddress: 'ул. Ахунбаева 42', deliverySlot: null, customer: { name: 'Айгуль', phone: '+996700000001' }, payments: [], logisticsSlot: null },
    { id: 'o-4131', total: 18500, deliveryAddress: 'мкр Джал 23', deliverySlot: null, customer: { name: 'Бектур', phone: '+996700000002' }, payments: [], logisticsSlot: null },
    { id: 'o-4140', total: 67000, deliveryAddress: 'ул. Токтогула 88', deliverySlot: null, customer: { name: 'Садык', phone: '+996700000003' }, payments: [], logisticsSlot: null },
  ],
  runs: [
    { id: 'R-08', courierId: 'c-daniyar', codTotal: 127500, collectedTotal: 0, handedOver: false, orders: [
      { id: 'o-4102', deliveryAddress: 'ул. Киевская 95', status: 'delivered', customer: { name: 'Клиент' }, logisticsSlot: null },
      { id: 'o-4098', deliveryAddress: 'пр. Чуй 155', status: 'delivered', customer: { name: 'Клиент' }, logisticsSlot: null },
      { id: 'o-4120', deliveryAddress: 'ул. Ахунбаева 42', status: 'in_transit', customer: { name: 'Айгуль' }, logisticsSlot: null },
      { id: 'o-4131', deliveryAddress: 'мкр Джал 23', status: 'in_transit', customer: { name: 'Бектур' }, logisticsSlot: null },
      { id: 'o-4140', deliveryAddress: 'ул. Токтогула 88', status: 'in_transit', customer: { name: 'Садык' }, logisticsSlot: null },
    ] },
  ],
  pickupPoints: [
    { id: 'p-center', code: 'center', name: 'AliStore Центр', address: 'ул. Киевская 95', inventoryLocation: 'BISHKEK-1', hours: 'Ежедневно 10:00–21:00', pickupInstructions: null, active: true, sortOrder: 1, waiting: 8, status: 'работает', type: 'свой магазин' },
    { id: 'p-osh', code: 'osh', name: 'AliStore Ош', address: 'ул. Ленина 12', inventoryLocation: 'OSH-1', hours: 'Ежедневно 10:00–21:00', pickupInstructions: null, active: true, sortOrder: 2, waiting: 3, status: 'работает', type: 'свой магазин' },
    { id: 'p-jal', code: 'pvz-jal', name: 'ПВЗ Джал', address: 'мкр Джал 23', inventoryLocation: 'BISHKEK-2', hours: 'Пн–Сб 10:00–20:00', pickupInstructions: null, active: true, sortOrder: 3, waiting: 5, status: 'работает', type: 'партнёр' },
    { id: 'p-alamedin', code: 'pvz-alamedin', name: 'ПВЗ Аламедин', address: 'ул. Аламедин 7', inventoryLocation: 'BISHKEK-3', hours: 'Пн–Сб 10:00–20:00', pickupInstructions: null, active: false, sortOrder: 4, waiting: 0, status: 'открытие', type: 'партнёр' },
  ],
};

export function LogisticsView({ accessToken }: { accessToken: string }) {
  const [tab, setTab] = useState<Tab>('zones');
  const [date, setDate] = useState(today);
  const [data, setData] = useState<LogisticsOverview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [zoneName, setZoneName] = useState(''); const [zoneCode, setZoneCode] = useState(''); const [fee, setFee] = useState('300');
  const [zoneId, setZoneId] = useState(''); const [start, setStart] = useState('10:00'); const [end, setEnd] = useState('12:00'); const [capacity, setCapacity] = useState('4');
  const [courierId, setCourierId] = useState(''); const [selected, setSelected] = useState<string[]>([]);
  const [pointCode, setPointCode] = useState(''); const [pointName, setPointName] = useState(''); const [pointAddress, setPointAddress] = useState('');
  const [pointLocation, setPointLocation] = useState(''); const [pointHours, setPointHours] = useState('Ежедневно 10:00–21:00');
  const reloadSequence = useRef(0);
  const dispatchCommand = useRef<{ fingerprint: string; key: string } | null>(null);
  const reload = useCallback(async () => {
    const sequence = ++reloadSequence.current;
    setMessage('');
    try {
      const result = await fetchLogisticsOverview(date, accessToken);
      if (sequence !== reloadSequence.current) return;
      setData(result);
      setZoneId((value) => value || result.zones[0]?.id || '');
      setCourierId((value) => value || result.couriers[0]?.id || '');
    } catch {
      if (sequence !== reloadSequence.current) return;
      setData(DEFAULT_LOGISTICS);
      setZoneId(DEFAULT_LOGISTICS.zones[0]?.id ?? '');
      setCourierId(DEFAULT_LOGISTICS.couriers[0]?.id ?? '');
    }
  }, [accessToken, date]);
  useEffect(() => { void reload(); }, [reload]);
  const selectedOrders = useMemo(() => data?.pendingOrders.filter((order) => selected.includes(order.id)) ?? [], [data, selected]);
  const codTotal = selectedOrders.reduce((sum, order) => sum + Math.max(0, order.total - order.payments.filter((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status)).reduce((paid, payment) => paid + payment.amount, 0)), 0);

  async function addZone(event: FormEvent) { event.preventDefault(); setBusy('zone'); setMessage(''); try { await createDeliveryZone({ code: zoneCode.trim(), name: zoneName.trim(), fee: Math.round(Number(fee)), etaMinMinutes: 60, etaMaxMinutes: 180 }, accessToken); setZoneName(''); setZoneCode(''); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Зона не создана'); } finally { setBusy(''); } }
  async function addSlot(event: FormEvent) { event.preventDefault(); setBusy('slot'); setMessage(''); try { await createDeliverySlot({ zoneId, startsAt: localIso(date, start), endsAt: localIso(date, end), capacity: Math.round(Number(capacity)) }, accessToken); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Слот не создан'); } finally { setBusy(''); } }
  async function dispatch() { if (!courierId || !selected.length) return; const input = { courierId, orderIds: [...selected].sort(), codTotal }; const fingerprint = JSON.stringify(input); if (dispatchCommand.current?.fingerprint !== fingerprint) dispatchCommand.current = { fingerprint, key: crypto.randomUUID() }; setBusy('dispatch'); setMessage(''); try { await createCourierRun(input, accessToken, dispatchCommand.current.key); dispatchCommand.current = null; setSelected([]); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Рейс не создан'); } finally { setBusy(''); } }
  async function addPoint(event: FormEvent) { event.preventDefault(); setBusy('point'); setMessage(''); try { await createStorePoint({ code: pointCode.trim(), name: pointName.trim(), address: pointAddress.trim(), inventoryLocation: pointLocation.trim(), hours: pointHours.trim() }, accessToken); setPointCode(''); setPointName(''); setPointAddress(''); setPointLocation(''); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Точка не создана'); } finally { setBusy(''); } }
  async function togglePoint(id: string, active: boolean) { setBusy(`point-${id}`); setMessage(''); try { await updateStorePoint(id, { active: !active }, accessToken); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Статус точки не изменён'); } finally { setBusy(''); } }

  /**
   * Working hours were read-only here even though PATCH /logistics/store-points
   * has always accepted `hours` — the only call site sent `{ active }`. Changing
   * a branch's hours therefore meant creating a duplicate point and deactivating
   * the old one. Saved on blur, and only when the value actually changed.
   */
  async function savePointHours(id: string, hours: string, previous: string) {
    if (hours.trim() === previous.trim()) return;
    setBusy(`hours-${id}`); setMessage('');
    try { await updateStorePoint(id, { hours: hours.trim() }, accessToken); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Часы работы не сохранены'); await reload(); }
    finally { setBusy(''); }
  }

  return <div data-testid="logistics-view" className="space-y-4">
    <header className="flex flex-col gap-3 border-b border-surface-3 pb-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · Logistics 3.0</div><h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Логистика</h1><p className="mt-1 text-xs leading-5 text-subtle">Зоны, слоты, точки выдачи и маршруты курьеров.</p></div><div className="text-[11px] text-subtle"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-lime" /> {data?.runs.length ?? 0} активных рейсов</div></header>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-3 pb-4"><div className="flex gap-2" role="tablist">{TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`rounded-full border px-4 py-2 text-xs font-semibold ${tab === item.id ? 'border-coral bg-coral text-white' : 'border-surface-3 bg-ink-dark text-muted'}`}>{item.label}</button>)}</div><label className="text-[10px] text-subtle">Дата<input aria-label="Дата логистики" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="ml-2 h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" /></label></div>
    {message && <div role="alert" className="rounded-[6px] border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-coral-tint">{message}</div>}
    {tab === 'zones' && <><div className="grid gap-4 lg:grid-cols-2"><section className="rounded-[8px] border border-surface-3 bg-ink-dark p-5"><h3 className="font-display text-sm font-bold">Зоны доставки</h3><div className="mt-3">{data?.zones.map((zone) => <div key={zone.id} className="flex items-center gap-3 border-t border-surface-2 py-3 text-xs"><span className="h-3 w-3 rounded-full bg-lime" /><strong className="min-w-0 flex-1 truncate">{zone.name}</strong><span className="text-subtle">{zone.etaMinMinutes}–{zone.etaMaxMinutes} мин</span><span className="font-mono text-lime">{zone.fee ? som(zone.fee) : 'беспл.'}</span></div>)}{!data?.zones.length && <p className="py-8 text-center text-sm text-subtle">Зон пока нет</p>}</div></section><section className="rounded-[8px] border border-surface-3 bg-ink-dark p-5"><h3 className="font-display text-sm font-bold">Слоты на выбранный день</h3><div className="mt-3">{data?.zones.flatMap((zone) => zone.slots.map((slot) => <div key={slot.id} data-testid={`slot-${slot.id}`} className="grid grid-cols-[100px_1fr_auto] items-center gap-3 border-t border-surface-2 py-3 text-xs"><span>{clock(slot.startsAt)}–{clock(slot.endsAt)}</span><div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={`h-full ${slot.remaining ? 'bg-lime' : 'bg-danger-soft'}`} style={{ width: `${Math.min(100, slot.reserved / slot.capacity * 100)}%` }} /></div><span className={slot.remaining ? 'text-lime' : 'text-danger-soft'}>{slot.reserved}/{slot.capacity}</span></div>))}</div></section></div><div className="grid gap-4 border-t border-surface-3 pt-4 lg:grid-cols-2"><form onSubmit={addZone} className="grid grid-cols-[1fr_1fr_100px_auto] gap-2"><input aria-label="Код зоны" value={zoneCode} onChange={(event) => setZoneCode(event.target.value)} placeholder="center" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><input aria-label="Название зоны" value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="Центр" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><input aria-label="Тариф зоны" value={fee} onChange={(event) => setFee(event.target.value)} inputMode="numeric" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><button disabled={busy === 'zone'} className="h-10 rounded-[6px] bg-coral px-4 text-sm font-bold">Добавить</button></form><form onSubmit={addSlot} className="grid grid-cols-[1.2fr_80px_80px_70px_auto] gap-2"><select aria-label="Зона слота" value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-2 text-xs">{data?.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select><input aria-label="Начало слота" type="time" value={start} onChange={(event) => setStart(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-2 text-xs" /><input aria-label="Конец слота" type="time" value={end} onChange={(event) => setEnd(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-2 text-xs" /><input aria-label="Ёмкость слота" value={capacity} onChange={(event) => setCapacity(event.target.value)} inputMode="numeric" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-2 text-xs" /><button disabled={busy === 'slot' || !zoneId} className="h-10 rounded-[6px] bg-lime px-3 text-sm font-bold text-coal">Создать</button></form></div></>}
    {tab === 'pickup' && <div className="space-y-4"><div className="overflow-hidden rounded-[8px] border border-surface-3 bg-ink-dark"><div className="grid grid-cols-[1.4fr_1.4fr_0.8fr_0.6fr_auto] px-5 py-3 text-[10px] uppercase text-subtle"><span>Точка</span><span>Адрес и склад</span><span>Часы</span><span>Ждёт</span><span>Доступность</span></div>{data?.pickupPoints.map((point) => <div key={point.id} data-testid={`store-point-${point.id}`} className="grid grid-cols-[1.4fr_1.4fr_0.8fr_0.6fr_auto] items-center border-t border-surface-2 px-5 py-3 text-xs"><strong>{point.name}<span className="mt-0.5 block font-mono text-[10px] font-normal text-subtle">{point.code}</span></strong><span className="text-muted">{point.address}<span className="block font-mono text-[10px]">{point.inventoryLocation}</span></span><input aria-label={`Часы работы точки ${point.name}`} defaultValue={point.hours ?? ''} disabled={busy === `hours-${point.id}`} onBlur={(event) => void savePointHours(point.id, event.target.value, point.hours ?? '')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} placeholder="Ежедневно 10:00–21:00" className="w-full min-w-0 rounded-[6px] border border-transparent bg-transparent px-2 py-1 text-xs text-muted outline-none hover:border-surface-3 focus:border-coral focus:bg-surface disabled:opacity-50" /><span className="font-mono text-warn">{point.waiting ?? 0}</span><button type="button" disabled={busy === `point-${point.id}`} onClick={() => togglePoint(point.id, point.active !== false)} className={`h-8 rounded-[6px] border px-3 text-[11px] font-semibold ${point.active !== false ? 'border-lime/40 text-lime' : 'border-[#5C534B] text-subtle'}`}>{point.active !== false ? 'Активна' : 'Отключена'}</button></div>)}{!data?.pickupPoints.length && <div className="border-t border-surface-2 py-10 text-center text-sm text-subtle">Точек выдачи пока нет</div>}</div><form onSubmit={addPoint} className="grid gap-2 border-t border-surface-3 pt-4 lg:grid-cols-[0.7fr_1fr_1.4fr_0.8fr_1fr_auto]"><input required aria-label="Код точки" value={pointCode} onChange={(event) => setPointCode(event.target.value)} placeholder="asia-mall" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><input required aria-label="Название точки" value={pointName} onChange={(event) => setPointName(event.target.value)} placeholder="AliStore Asia Mall" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><input required aria-label="Адрес точки" value={pointAddress} onChange={(event) => setPointAddress(event.target.value)} placeholder="Бишкек, адрес" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><input required aria-label="Код склада точки" value={pointLocation} onChange={(event) => setPointLocation(event.target.value)} placeholder="BISHKEK-2" className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 font-mono text-sm" /><input required aria-label="Часы точки" value={pointHours} onChange={(event) => setPointHours(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" /><button disabled={busy === 'point'} className="h-10 rounded-[6px] bg-coral px-4 text-sm font-bold">Добавить</button></form></div>}
    {tab === 'routes' && <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]"><section className="rounded-[8px] border border-surface-3 bg-ink-dark p-5"><div className="mb-3 flex items-center"><h3 className="font-display text-sm font-bold">Диспетчеризация</h3><span className="ml-auto text-xs text-subtle">{data?.pendingOrders.length ?? 0} ожидают</span></div><div className="max-h-72 overflow-y-auto">{data?.pendingOrders.map((order) => <label key={order.id} className="flex cursor-pointer gap-3 border-t border-surface-2 py-3 text-xs"><input type="checkbox" checked={selected.includes(order.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, order.id] : current.filter((id) => id !== order.id))} /><span className="min-w-0 flex-1"><strong className="block truncate">{order.customer.name} · {order.id.slice(-6)}</strong><span className="text-subtle">{order.deliveryAddress || 'Адрес не указан'}</span></span><span className="font-mono">{som(order.total)}</span></label>)}</div><div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><select aria-label="Курьер рейса" value={courierId} onChange={(event) => setCourierId(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm">{data?.couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.username}</option>)}</select><button onClick={dispatch} disabled={!selected.length || !courierId || busy === 'dispatch'} className="h-10 rounded-[6px] bg-coral px-4 text-sm font-bold disabled:opacity-50">Создать рейс · {selected.length}</button></div></section><section className="space-y-3">{data?.runs.map((run) => <article key={run.id} data-testid={`route-${run.id}`} className="rounded-[8px] border border-surface-3 bg-ink-dark p-5"><div className="flex items-center"><strong className="font-display text-sm">Рейс {run.id.slice(-6)}</strong><span className="ml-auto text-xs text-lime">{run.orders.length} точек · COD {som(run.codTotal)}</span></div><div className="mt-3">{run.orders.map((order, index) => <div key={order.id} className="flex gap-3 border-t border-surface-2 py-3 text-xs"><span className="grid h-6 w-6 place-items-center rounded-full bg-coral font-bold">{index + 1}</span><span><strong className="block">{order.deliveryAddress || order.customer.name}</strong><span className="text-subtle">Заказ {order.id.slice(-6)} · {order.status}</span></span></div>)}</div></article>)}{!data?.runs.length && <div className="grid min-h-48 place-items-center rounded-[8px] border border-surface-3 bg-ink-dark text-sm text-subtle">Рейсов пока нет</div>}</section></div>}
  </div>;
}
