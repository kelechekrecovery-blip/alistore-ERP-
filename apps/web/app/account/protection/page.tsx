'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import {
  acceptProtection,
  fetchMyDevices,
  fetchMyProtection,
  requestProtection,
  type DeviceProtectionPolicy,
  type MyDevice,
  type ProtectionPlanType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { som } from '@/lib/format';

const PLANS: Array<{ id: ProtectionPlanType; label: string; detail: string }> = [
  { id: 'accidental_damage', label: 'Случайные повреждения', detail: 'Экран, падение и механические повреждения' },
  { id: 'extended_warranty', label: 'Расширенная гарантия', detail: 'Неисправности после основной гарантии' },
  { id: 'full_protection', label: 'Полная защита', detail: 'Повреждения и расширенная гарантия' },
];

export default function ProtectionPage() {
  const router = useRouter();
  const { user, hydrated, authed } = useAuth();
  const [devices, setDevices] = useState<MyDevice[]>([]);
  const [policies, setPolicies] = useState<DeviceProtectionPolicy[]>([]);
  const [imei, setImei] = useState('');
  const [planType, setPlanType] = useState<ProtectionPlanType>('full_protection');
  const [coverageMonths, setCoverageMonths] = useState<12 | 24>(12);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (hydrated && !user) router.replace('/login?next=/account/protection');
  }, [hydrated, router, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([authed(fetchMyDevices), authed(fetchMyProtection)])
      .then(([owned, current]) => {
        if (cancelled) return;
        setDevices(owned);
        setPolicies(current);
        setImei((value) => value || owned[0]?.imei || '');
      })
      .catch(() => setMessage('Не удалось загрузить устройства'));
    return () => { cancelled = true; };
  }, [authed, user]);

  async function submit() {
    if (!imei) return;
    setBusy(true);
    setMessage('');
    try {
      await authed((token) => requestProtection({ imei, planType, coverageMonths }, token));
      setPolicies(await authed(fetchMyProtection));
      setMessage('Заявка на защиту отправлена');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать заявку');
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: string) {
    setBusy(true);
    try {
      await authed((token) => acceptProtection(id, token));
      setPolicies(await authed(fetchMyProtection));
      setMessage('Защита устройства активирована');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось активировать защиту');
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !user) {
    return <div className="fixed inset-0 grid place-items-center bg-[#16130F] font-mono text-sm text-[#8A7F76]">Загрузка…</div>;
  }

  return (
    <MobileAppFrame title="Защита устройства" subtitle="Дополнительное покрытие для техники, купленной в AliStore." active="account" backHref="/account">
      {devices.length === 0 ? (
        <div className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-5 text-center text-sm text-[#A79C92]">После покупки устройство появится здесь и станет доступно для защиты.</div>
      ) : (
        <section className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4" data-testid="protection-form">
          <label className="block text-[12px] text-[#A79C92]">
            Устройство
            <select data-testid="protection-imei" value={imei} onChange={(event) => setImei(event.target.value)} className="mt-1.5 w-full rounded-[10px] border border-[#2E2822] bg-[#16130F] px-3 py-3 text-sm text-white">
              {devices.map((device) => <option key={device.imei} value={device.imei}>{device.product} · {device.imei}</option>)}
            </select>
          </label>
          <div className="mt-4 space-y-2">
            {PLANS.map((plan) => (
              <button key={plan.id} type="button" onClick={() => setPlanType(plan.id)} className={`w-full rounded-[11px] border p-3 text-left ${planType === plan.id ? 'border-lime bg-lime/5' : 'border-[#2E2822] bg-[#16130F]'}`}>
                <span className="block text-sm font-semibold">{plan.label}</span>
                <span className="mt-1 block text-[11px] text-[#8A7F76]">{plan.detail}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[12, 24].map((months) => (
              <button key={months} type="button" onClick={() => setCoverageMonths(months as 12 | 24)} className={`rounded-[10px] border py-2.5 text-xs font-semibold ${coverageMonths === months ? 'border-lime text-lime' : 'border-[#2E2822] text-[#A79C92]'}`}>{months} месяцев</button>
            ))}
          </div>
          {message && <p role="status" className="mt-3 text-center text-sm text-lime">{message}</p>}
          <button data-testid="protection-submit" type="button" disabled={busy || !imei} onClick={submit} className="mt-3 w-full rounded-[13px] bg-lime py-3.5 text-sm font-bold text-lime-ink disabled:opacity-50">{busy ? 'Отправляем…' : 'Рассчитать и отправить'}</button>
        </section>
      )}

      {policies.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-3 font-display text-base font-bold">Мои полисы</h2>
          {policies.map((policy) => (
            <article key={policy.id} className="mb-2.5 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{policy.productName}</span>
                <span className="rounded-md bg-lime/15 px-2 py-1 text-[10px] font-bold text-lime">{policy.status}</span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-[#8A7F76]">{policy.imei}</div>
              <div className="mt-2 text-xs text-[#A79C92]">{policy.coverageMonths} мес. · {PLANS.find((plan) => plan.id === policy.planType)?.label}</div>
              {policy.premium !== null && <div className="mt-2 font-display text-lg font-extrabold text-lime">{som(policy.premium)}</div>}
              {policy.staffNote && <p className="mt-1 text-xs text-[#A79C92]">{policy.staffNote}</p>}
              {policy.endsAt && <p className="mt-1 text-[11px] text-[#8A7F76]">Покрытие до {new Date(policy.endsAt).toLocaleDateString('ru-RU')}</p>}
              {policy.status === 'offered' && <button type="button" disabled={busy} onClick={() => accept(policy.id)} className="mt-3 w-full rounded-[9px] bg-lime py-2.5 text-xs font-bold text-lime-ink">Активировать предложение</button>}
            </article>
          ))}
        </section>
      )}
    </MobileAppFrame>
  );
}
