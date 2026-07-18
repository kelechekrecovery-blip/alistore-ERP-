'use client';

import Link from 'next/link';
import type { MyDevice } from '@/lib/api';
import { WarrantyRequest } from '@/components/WarrantyRequest';

/** Mask the middle of an IMEI: 355812••• 042 (keep first 5 + last 3). */
function maskImei(imei: string): string {
  if (imei.length <= 8) return imei;
  return `${imei.slice(0, 5)}••• ${imei.slice(-3)}`;
}

function ruDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const COVERAGE = ['✓ Заводской брак', '✓ Неисправности экрана, батареи', '✗ Механические повреждения, влага'];

/** Гарантийный талон — warranty certificate card (Клиент App 2.0). */
export function WarrantyCertificate({ device, customerId }: { device: MyDevice; customerId: string }) {
  const active = (device.daysLeft ?? 0) > 0;
  return (
    <div>
      <div className="rounded-[18px] border border-surface-3 bg-gradient-to-br from-[#2A2A2E] to-surface-2 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-coral font-display text-[13px] font-extrabold text-white">A</span>
            <span className="text-sm font-bold">Гарантийный талон</span>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${active ? 'bg-lime/15 text-lime' : 'bg-line text-subtle'}`}>
            {active ? '● Активна' : '○ Истекла'}
          </span>
        </div>

        <div className="mt-4 font-display text-[19px] font-bold">{device.product}</div>
        <div className="mt-1 font-mono text-xs text-muted">IMEI {maskImei(device.imei)}</div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase text-subtle">Гарантия до</div>
            <div className="mt-0.5 text-sm">{device.warrantyUntil ? ruDate(device.warrantyUntil) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-subtle">Осталось</div>
            <div className={`mt-0.5 text-sm ${active ? 'text-lime' : 'text-subtle'}`}>
              {device.daysLeft != null ? `${device.daysLeft} дн` : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {device.warranty ? (
          <div className="grid place-items-center rounded-[11px] bg-surface-2 px-3 py-3 text-center text-[13px] text-bright">
            🛠 Заявка в сервисе
          </div>
        ) : (
          <WarrantyRequest imei={device.imei} customerId={customerId} />
        )}
        <Link href="/account/orders" className="grid place-items-center rounded-[11px] border border-surface-3 bg-surface-2 px-3 py-3 text-center text-[13px] text-bright">
          🧾 Чек
        </Link>
      </div>

      <div className="mt-3 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
        <div className="mb-2 text-[13px] font-semibold">Что покрывается</div>
        <div className="text-xs leading-[1.7] text-muted">
          {COVERAGE.map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
