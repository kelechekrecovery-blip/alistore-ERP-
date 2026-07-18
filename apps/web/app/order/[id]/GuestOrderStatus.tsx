'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Clock3, FileText, MapPin, PackageCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { fetchGuestOrder, fetchGuestReceipt, type GuestOrderView } from '@/lib/api';
import { captureGuestOrderAccess } from '@/lib/guest-order-access';
import { buildOrderTimeline, TERMINAL_BAD } from '@/lib/order-status';
import { som } from '@/lib/format';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'invalid' } | { kind: 'ready'; view: GuestOrderView; capability: string };

export default function GuestOrderStatus({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptMessage, setReceiptMessage] = useState('');

  useEffect(() => {
    const capability = captureGuestOrderAccess(orderId);
    if (!capability) return setState({ kind: 'missing' });
    fetchGuestOrder(orderId, capability)
      .then((view) => setState({ kind: 'ready', view, capability }))
      .catch((error) => setState({ kind: error instanceof Error && error.message === 'guest_access_invalid' ? 'invalid' : 'missing' }));
  }, [orderId]);

  const steps = useMemo(() => state.kind === 'ready' ? buildOrderTimeline(state.view.timeline) : [], [state]);

  async function openReceipt() {
    if (state.kind !== 'ready') return;
    setReceiptMessage('');
    try {
      const result = await fetchGuestReceipt(orderId, state.capability);
      setReceipt(result.markup);
    } catch (error) {
      setReceiptMessage(error instanceof Error && error.message === 'receipt_not_available'
        ? 'Чек появится после подтверждения оплаты.'
        : 'Не удалось загрузить чек. Обновите страницу.');
    }
  }

  return (
    <div className="min-h-screen bg-paper text-coal">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-12">
        {state.kind === 'loading' && <StatusPanel icon={<RefreshCw className="animate-spin" />} title="Загружаем заказ" text="Проверяем защищённую ссылку и актуальный статус." />}
        {state.kind === 'missing' && <StatusPanel icon={<ShieldCheck />} title="Нужна защищённая ссылка" text="Откройте ссылку, которую получили сразу после оформления заказа на этом устройстве." />}
        {state.kind === 'invalid' && <StatusPanel icon={<ShieldCheck />} title="Ссылка недействительна" text="Срок доступа истёк или ссылка была изменена. Войдите по номеру телефона, чтобы увидеть заказ." />}
        {state.kind === 'ready' && (() => {
          const order = state.view.order;
          const problem = TERMINAL_BAD[order.status];
          return <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-haze pb-5">
              <div><p className="text-xs font-semibold uppercase text-subtle">Защищённый гостевой доступ</p><h1 className="mt-1 text-2xl font-bold md:text-3xl">Заказ #{order.id.slice(-8)}</h1><p className="mt-2 text-sm text-faint">{new Date(order.createdAt).toLocaleString('ru-RU')} · {som(order.total)}</p></div>
              <span className="rounded-md bg-coal px-3 py-2 text-xs font-semibold text-white">{order.status}</span>
            </div>
            {problem && <div className="mb-5 border border-coral-tint bg-sand p-4 text-sm font-semibold text-[#b52e1a]">{problem}</div>}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="border border-mist bg-white p-5 md:p-6" aria-label="Статус заказа">
                <h2 className="flex items-center gap-2 text-base font-bold"><Clock3 size={18} /> Выполнение заказа</h2>
                <div className="mt-5 space-y-0">{steps.map((step, index) => <div key={step.title} className="flex gap-3"><div className="flex flex-col items-center"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${step.state === 'done' ? 'bg-coal text-white' : step.state === 'current' ? 'bg-coral text-white' : 'bg-sand text-subtle'}`}>{step.state === 'done' ? '✓' : index + 1}</span>{index < steps.length - 1 && <span className="h-10 w-px bg-haze" />}</div><div><div className="text-sm font-semibold">{step.title}</div><div className="mt-0.5 text-xs text-subtle">{step.time ? new Date(step.time).toLocaleString('ru-RU') : step.state === 'current' ? 'в процессе' : 'ожидает'}</div></div></div>)}</div>
              </section>
              <aside className="space-y-5">
                <section className="border border-mist bg-white p-5"><h2 className="flex items-center gap-2 text-base font-bold"><MapPin size={18} /> Получение</h2><p className="mt-3 text-sm font-semibold">{order.pickupPoint ?? order.deliveryAddress ?? order.fulfillmentType ?? 'Самовывоз'}</p>{order.deliverySlot && <p className="mt-1 text-xs text-subtle">{order.deliverySlot}</p>}{order.pickupCode && <div className="mt-4 bg-paper p-3"><div className="text-xs text-subtle">Код выдачи</div><strong className="mt-1 block text-xl">{order.pickupCode}</strong></div>}</section>
                <section className="border border-mist bg-white p-5"><h2 className="flex items-center gap-2 text-base font-bold"><PackageCheck size={18} /> Состав</h2><div className="mt-3 divide-y divide-mist">{order.items.map((item, index) => <div key={`${item.sku}-${index}`} className="flex justify-between gap-3 py-2 text-sm"><span>{item.sku} × {item.qty}</span><strong>{som(item.price * item.qty)}</strong></div>)}</div></section>
                <button type="button" onClick={openReceipt} className="flex w-full items-center justify-center gap-2 bg-coal px-4 py-3 text-sm font-bold text-white"><FileText size={17} /> Показать чек</button>
                {receiptMessage && <p role="status" className="text-sm text-[#b52e1a]">{receiptMessage}</p>}
              </aside>
            </div>
            {receipt && <section className="mt-5 border border-mist bg-white p-5 md:p-6"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-bold">Чек заказа</h2><button type="button" onClick={() => window.print()} className="text-sm font-semibold text-coral">Печать</button></div><pre data-testid="guest-receipt" className="overflow-x-auto whitespace-pre-wrap bg-paper p-4 font-mono text-xs leading-6">{receipt}</pre></section>}
          </>;
        })()}
      </main>
      <SiteFooter />
    </div>
  );
}

function StatusPanel({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="mx-auto max-w-[560px] border border-mist bg-white p-8 text-center"><div className="mx-auto grid h-11 w-11 place-items-center text-coral">{icon}</div><h1 className="mt-4 text-xl font-bold">{title}</h1><p className="mx-auto mt-2 max-w-[430px] text-sm leading-6 text-faint">{text}</p><Link href="/login" className="mt-5 inline-block bg-coal px-5 py-3 text-sm font-bold text-white">Войти по телефону</Link></div>;
}
