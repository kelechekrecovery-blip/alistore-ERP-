'use client';

import { ArrowLeft, Smartphone, UserRound, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchServicePaymentContext, payServiceWorkOrder, type PosPayment, type ServicePaymentContext } from '@/lib/api';
import { som } from '@/lib/format';
import type { StaffSession } from '@/lib/staff-session';
import { PosCheckout } from './PosCheckout';

const SERVICE_PAYMENT_METHODS = ['cash', 'card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank'];

export function ServicePosPayment({ workOrderId, session, onBack }: { workOrderId: string; session: StaffSession; onBack: () => void }) {
  const [context, setContext] = useState<ServicePaymentContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [route, setRoute] = useState<'sell' | 'pay' | 'done'>('sell');
  const [method, setMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paidTotal, setPaidTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchServicePaymentContext(workOrderId, session.accessToken)
      .then((next) => {
        setContext(next);
        const total = next.paidTotal;
        setPaidTotal(total);
        if (next.estimateAmount && total >= next.estimateAmount) setRoute('done');
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Не удалось загрузить ремонт'))
      .finally(() => setLoading(false));
  }, [session.accessToken, workOrderId]);

  async function finish(payments?: PosPayment[]) {
    if (!context || !payments?.length) return;
    const storageKey = `alistore.service.payment.${workOrderId}`;
    const key = window.localStorage.getItem(storageKey) ?? crypto.randomUUID();
    window.localStorage.setItem(storageKey, key);
    setBusy(true);
    setError('');
    try {
      const result = await payServiceWorkOrder(workOrderId, payments, session.accessToken, key);
      window.localStorage.removeItem(storageKey);
      setContext({ ...context, paidTotal: result.paidTotal });
      setPaidTotal(result.paidTotal);
      setRoute('done');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось провести оплату');
      setRoute('sell');
    } finally {
      setBusy(false);
    }
  }

  const total = context?.estimateAmount ?? 0;
  const fullyPaid = total > 0 && paidTotal >= total;
  const partiallyRefunded = paidTotal > 0 && paidTotal < total;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-night p-4 font-sans text-white">
    <main data-testid="service-payment-ticket" className="relative h-[720px] max-h-[94vh] w-full max-w-[920px] overflow-hidden rounded-[24px] border-8 border-ink bg-ink-dark shadow-2xl">
      <header className="flex items-center gap-3 border-b border-surface-3 px-6 py-4">
        <button type="button" onClick={onBack} aria-label="Назад к продаже" className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#3B342D] text-bright"><ArrowLeft size={18} /></button>
        <div><div className="font-display text-lg font-bold">Оплата ремонта</div><div className="font-mono text-[11px] text-subtle">POS · {session.username}</div></div>
      </header>
      {loading && <div className="grid h-[600px] place-items-center font-mono text-sm text-subtle">Загрузка заказ-наряда…</div>}
      {!loading && error && !context && <div className="grid h-[600px] place-items-center px-6 text-center text-sm text-danger">{error}</div>}
      {!loading && context && <div className="grid h-[calc(100%-73px)] grid-cols-[1fr_340px]">
        <section className="p-7">
          <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-[8px] bg-coral/15 text-coral"><Wrench /></div><div><div className="font-display text-xl font-bold">{context.warrantyCase.deviceName ?? 'Устройство'}</div><div className="font-mono text-xs text-subtle">{context.warrantyCase.imei}</div></div></div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Info icon={<UserRound size={16} />} label="Клиент" value={`${context.customer?.name ?? 'Клиент'} · ${context.customer?.phone ?? ''}`} />
            <Info icon={<Smartphone size={16} />} label="Статус" value={fullyPaid ? 'Оплачено' : partiallyRefunded ? 'Частичный возврат' : 'Смета подтверждена'} />
          </div>
          <div className="mt-5 rounded-[8px] border border-surface-3 bg-surface p-4"><div className="text-xs font-semibold text-bright">Диагностика</div><p className="mt-2 text-sm leading-6 text-muted">{context.diagnosticSummary}</p></div>
          {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        </section>
        <aside className="border-l border-surface-3 bg-surface p-6">
          <div className="text-xs font-semibold uppercase text-subtle">Заказ-наряд</div><div className="mt-1 font-mono text-sm text-white">SRV-{context.id.slice(-8).toUpperCase()}</div>
          <div className="mt-8 flex items-end justify-between border-b border-surface-3 pb-5"><span className="text-sm text-muted">К оплате</span><span className="font-display text-3xl font-extrabold text-lime">{som(total)}</span></div>
          {fullyPaid ? <div data-testid="service-payment-success" className="mt-6 rounded-[8px] border border-lime/30 bg-lime/10 p-4 text-sm font-semibold text-lime">Оплачено · {som(paidTotal)}</div> : partiallyRefunded ? <div data-testid="service-payment-partial-refund" className="mt-6 rounded-[8px] border border-warn/30 bg-warn/10 p-4 text-sm font-semibold text-warn">Частичный возврат · осталось оплачено {som(paidTotal)}</div> : <button data-testid="service-payment-open" type="button" onClick={() => { setMethod(null); setRoute('pay'); }} className="mt-6 w-full rounded-[8px] bg-lime px-4 py-3.5 text-sm font-bold text-lime-ink">Принять оплату</button>}
        </aside>
      </div>}
      {context && route !== 'sell' && <PosCheckout route={route} total={total} discountLimit={0} method={method} busy={busy} pending={null} result={null} completion={route === 'done' ? { title: 'Ремонт оплачен', reference: `SRV-${context.id.slice(-8).toUpperCase()}`, total: paidTotal } : null} title="Оплата ремонта" confirmLabel="Оплатить ремонт" newLabel="Закрыть" allowedMethods={SERVICE_PAYMENT_METHODS} onSelectMethod={setMethod} onFinish={(payments) => void finish(payments)} onCancel={() => setRoute('sell')} onNewSale={onBack} />}
    </main>
  </div>;
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-[8px] border border-surface-3 bg-surface p-4"><div className="flex items-center gap-2 text-xs text-subtle">{icon}{label}</div><div className="mt-2 text-sm font-semibold text-white">{value}</div></div>;
}
