'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchMyDevices, type MyDevice } from '@/lib/api';
import { WarrantyRequest } from '@/components/WarrantyRequest';

const WSTATUS: Record<string, string> = {
  created: 'Обращение принято', received: 'Принято в сервис', diagnostics: 'Диагностика',
  waiting_supplier: 'Ждём поставщика', approved: 'Ремонт одобрен', repaired: 'Отремонтировано',
  replaced: 'Замена', rejected: 'Отклонено', closed: 'Закрыто',
};

export default function DevicesPage() {
  const { user, hydrated, authed } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<MyDevice[] | null>(null);

  useEffect(() => { if (hydrated && !user) router.replace('/login?next=/account/devices'); }, [hydrated, user, router]);
  useEffect(() => { if (user) authed(fetchMyDevices).then(setDevices).catch(() => setDevices([])); }, [user, authed]);

  if (!hydrated || !user) {
    return <div className="fixed inset-0 z-40 grid place-items-center bg-[#16130F] font-mono text-sm text-[#8A7F76]">Загрузка…</div>;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        <div className="flex items-center gap-3 px-4 pb-3 pt-5">
          <button type="button" onClick={() => router.back()} className="text-xl">←</button>
          <span className="font-display text-xl font-bold">Мои устройства</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {devices === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
          {devices && devices.length === 0 && (
            <div className="py-12 text-center">
              <div className="text-5xl">📱</div>
              <div className="mt-3.5 font-display text-[17px] font-bold">Пока нет устройств</div>
              <div className="mt-2 text-[13px] text-[#A79C92]">Купленная техника появится здесь с гарантией</div>
            </div>
          )}
          {(devices ?? []).map((d) => {
            const w = d.warranty;
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
