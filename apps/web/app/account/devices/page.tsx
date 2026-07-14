'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { approveMyServiceEstimate, fetchMyDevices, fetchMyServiceWorkOrders, receivedServiceTotal, type MyDevice, type ServiceWorkOrder } from '@/lib/api';
import { WarrantyRequest } from '@/components/WarrantyRequest';
import { AccountDetailFrame } from '@/components/AccountDetailFrame';

const WSTATUS: Record<string, string> = {
  created: 'Обращение принято', received: 'Принято в сервис', diagnostics: 'Диагностика',
  waiting_supplier: 'Ждём поставщика', approved: 'Ремонт одобрен', repairing: 'Ремонт выполняется', repaired: 'Отремонтировано',
  replaced: 'Замена', rejected: 'Отклонено', closed: 'Закрыто',
};

export default function DevicesPage() {
  const { user, hydrated, authed } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<MyDevice[] | null>(null);
  const [workOrders, setWorkOrders] = useState<ServiceWorkOrder[]>([]);
  const [approving, setApproving] = useState('');
  const [serviceError, setServiceError] = useState('');

  useEffect(() => { if (hydrated && !user) router.replace('/login?next=/account/devices'); }, [hydrated, user, router]);
  useEffect(() => {
    if (!user) return;
    Promise.all([authed(fetchMyDevices), authed(fetchMyServiceWorkOrders)])
      .then(([nextDevices, nextWorkOrders]) => { setDevices(nextDevices); setWorkOrders(nextWorkOrders); })
      .catch(() => { setDevices([]); setWorkOrders([]); });
  }, [user, authed]);

  async function approveEstimate(workOrder: ServiceWorkOrder) {
    const storageKey = `alistore.service.approve.${workOrder.id}`;
    const key = localStorage.getItem(storageKey) ?? crypto.randomUUID();
    localStorage.setItem(storageKey, key);
    setApproving(workOrder.id);
    setServiceError('');
    try {
      const updated = await authed((token) => approveMyServiceEstimate(workOrder.id, token, key));
      localStorage.removeItem(storageKey);
      setWorkOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setServiceError('Не удалось подтвердить смету. Повторите ещё раз.');
    } finally {
      setApproving('');
    }
  }

  if (!hydrated || !user) {
    return <div className="fixed inset-0 z-40 grid place-items-center bg-[#16130F] font-mono text-sm text-[#8A7F76]">Загрузка…</div>;
  }

  const paidRepairs = workOrders.filter((item) => item.warrantyCase.serviceType === 'paid');

  return (
    <AccountDetailFrame>
        <div className="flex items-center gap-3 px-4 pb-3 pt-5">
          <button type="button" onClick={() => router.back()} className="text-xl">←</button>
          <span className="font-display text-xl font-bold">Мои устройства</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {devices === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
          {devices && devices.length === 0 && paidRepairs.length === 0 && (
            <div className="py-12 text-center">
              <div className="text-5xl">📱</div>
              <div className="mt-3.5 font-display text-[17px] font-bold">Пока нет устройств</div>
              <div className="mt-2 text-[13px] text-[#A79C92]">Купленная техника появится здесь с гарантией</div>
            </div>
          )}
          {(devices ?? []).map((d) => {
            const w = d.warranty;
            const workOrder = workOrders.find((item) => item.warrantyCase.imei === d.imei);
            return (
              <div key={d.imei} className="mb-3 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
                <div className="flex gap-3">
                  <div className="grid h-[54px] w-[54px] flex-shrink-0 place-items-center rounded-[12px] bg-gradient-to-br from-[#2A2620] to-[#16130F] font-display text-xl font-extrabold text-white/15">{d.product.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold">{d.product}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#8A7F76]">IMEI {d.imei}</div>
                  </div>
                  <span className={`h-fit rounded-md px-2 py-0.5 text-[11px] ${w ? 'bg-warn/15 text-warn' : 'bg-lime/15 text-lime'}`}>
                    {w ? (WSTATUS[w.status] ?? w.status) : '🛡 Гарантия'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {w ? (
                    <span className="font-mono text-[11px] text-[#A79C92]">SLA до {new Date(w.sla).toLocaleDateString('ru-RU')}</span>
                  ) : (
                    <WarrantyRequest imei={d.imei} customerId={user.customerId} />
                  )}
                </div>
                {workOrder?.estimatePreparedAt && (
                  <div data-testid={`service-estimate-${workOrder.id}`} className="mt-3 rounded-[8px] border border-[#3B342D] bg-[#16130F] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-semibold text-[#D8CFC6]">Смета сервис-центра</div>
                        <div className="mt-1 text-[12px] text-[#8A7F76]">{workOrder.diagnosticSummary}</div>
                      </div>
                      <div className="whitespace-nowrap font-mono text-[13px] font-bold text-lime">{workOrder.estimateAmount?.toLocaleString('ru-RU')} с</div>
                    </div>
                    {workOrder.estimateApprovedAt ? (
                      <div className="mt-3 text-[12px] font-semibold text-lime">Смета подтверждена · устройство в работе</div>
                    ) : (
                      <button type="button" disabled={approving === workOrder.id} onClick={() => void approveEstimate(workOrder)} className="mt-3 w-full rounded-[8px] bg-coral px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                        {approving === workOrder.id ? 'Подтверждаем…' : 'Подтвердить смету'}
                      </button>
                    )}
                  </div>
                )}
                {serviceError && workOrder && <p role="alert" className="mt-2 text-[12px] text-danger">{serviceError}</p>}
                <Link
                  href={`/account/warranty/${encodeURIComponent(d.imei)}`}
                  className="mt-3 flex items-center justify-between border-t border-[#2E2822] pt-3 text-[13px] text-[#D8CFC6]"
                >
                  <span>🛡 Гарантийный талон{d.daysLeft != null ? ` · ещё ${d.daysLeft} дн` : ''}</span>
                  <span className="text-lime">→</span>
                </Link>
              </div>
            );
          })}
          {paidRepairs.length > 0 && <div className="mb-2 mt-5 font-display text-[15px] font-bold">Платный ремонт</div>}
          {paidRepairs.map((workOrder) => <div key={workOrder.id} data-testid={`paid-service-account-${workOrder.id}`} className="mb-3 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="text-[15px] font-bold">{workOrder.warrantyCase.deviceName ?? 'Устройство'}</div><div className="mt-0.5 font-mono text-[11px] text-[#8A7F76]">SN {workOrder.warrantyCase.imei}</div><div className="mt-2 text-[12px] text-[#A79C92]">{workOrder.warrantyCase.problem}</div></div>
              <span className="h-fit rounded-md bg-[#7FB0EC]/15 px-2 py-0.5 text-[11px] text-[#7FB0EC]">{WSTATUS[workOrder.warrantyCase.status] ?? workOrder.warrantyCase.status}</span>
            </div>
            {workOrder.estimatePreparedAt ? <div data-testid={`service-estimate-${workOrder.id}`} className="mt-3 rounded-[8px] border border-[#3B342D] bg-[#16130F] p-3">
              <div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-semibold text-[#D8CFC6]">Смета сервис-центра</div><div className="mt-1 text-[12px] text-[#8A7F76]">{workOrder.diagnosticSummary}</div></div><div className="whitespace-nowrap font-mono text-[13px] font-bold text-lime">{workOrder.estimateAmount?.toLocaleString('ru-RU')} с</div></div>
              {workOrder.estimateApprovedAt ? <ServicePaymentState workOrder={workOrder} /> : <button type="button" disabled={approving === workOrder.id} onClick={() => void approveEstimate(workOrder)} className="mt-3 w-full rounded-[8px] bg-coral px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{approving === workOrder.id ? 'Подтверждаем…' : 'Подтвердить смету'}</button>}
            </div> : <div className="mt-3 text-[12px] text-[#8A7F76]">Устройство принято, ожидается диагностика</div>}
            {serviceError && approving === '' && <p role="alert" className="mt-2 text-[12px] text-danger">{serviceError}</p>}
          </div>)}
        </div>
    </AccountDetailFrame>
  );
}

function ServicePaymentState({ workOrder }: { workOrder: ServiceWorkOrder }) {
  const paid = receivedServiceTotal(workOrder);
  const estimate = workOrder.estimateAmount ?? 0;
  if (estimate > 0 && paid >= estimate) {
    return <div data-testid={`service-payment-status-${workOrder.id}`} className="mt-3 text-[12px] font-semibold text-lime">Оплачено · {paid.toLocaleString('ru-RU')} с</div>;
  }
  if (paid > 0) {
    return <div data-testid={`service-payment-status-${workOrder.id}`} className="mt-3 text-[12px] font-semibold text-warn">Частичный возврат · осталось оплачено {paid.toLocaleString('ru-RU')} с</div>;
  }
  return <div data-testid={`service-payment-status-${workOrder.id}`} className="mt-3 text-[12px] font-semibold text-lime">Смета подтверждена · оплатите на кассе</div>;
}
