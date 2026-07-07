'use client';

import { useEffect, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/account-local';
import { fetchCustomerOverview, setConsent } from '@/lib/crm';

const notifications = [
  { icon: '📦', title: 'Заказ собирается', text: 'Скоро передадим курьеру', time: '5 мин назад', bg: '#221E19' },
  { icon: '🏷', title: 'Цена снизилась', text: 'Apple Watch S9 дешевле на 5 000 с', time: '1 ч назад', bg: '#16130F' },
  { icon: '🛡', title: 'Гарантия скоро истекает', text: 'AirPods Pro — осталось 12 дней', time: 'вчера', bg: '#16130F' },
  { icon: '🎁', title: 'Начислены бонусы', text: '+300 за отзыв', time: '2 дня назад', bg: '#16130F' },
];

export default function NotificationsPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [consentState, setConsentState] = useState<'unknown' | 'on' | 'off' | 'saving'>('unknown');

  useEffect(() => setPrefs(loadNotificationPrefs()), []);
  useEffect(() => { if (prefs) saveNotificationPrefs(prefs); }, [prefs]);
  useEffect(() => {
    if (!user?.customerId) return;
    fetchCustomerOverview(user.customerId)
      .then((ov) => setConsentState(ov.customer.consent ? 'on' : 'off'))
      .catch(() => setConsentState('unknown'));
  }, [user?.customerId]);

  function togglePref(key: keyof NotificationPrefs) {
    setPrefs((p) => (p ? { ...p, [key]: !p[key] } : p));
  }

  async function toggleConsent() {
    if (!user?.customerId || consentState === 'saving') return;
    const next = consentState !== 'on';
    const prev = consentState;
    setConsentState('saving');
    try {
      await setConsent(user.customerId, next, 'customer_app');
      setConsentState(next ? 'on' : 'off');
    } catch {
      setConsentState(prev);
    }
  }

  return (
    <MobileAppFrame title="Уведомления" subtitle="Статусы заказов, гарантия, бонусы и настройки связи." backHref="/account">
      {notifications.map((n) => (
        <div key={n.title} className="mb-2 flex gap-3 rounded-[13px] border border-[#2E2822] p-3.5" style={{ background: n.bg }}>
          <span className="text-xl">{n.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{n.title}</div>
            <div className="mt-1 text-[12px] leading-relaxed text-[#A79C92]">{n.text}</div>
            <div className="mt-1 font-mono text-[11px] text-[#6E645C]">{n.time}</div>
          </div>
        </div>
      ))}

      <div className="mt-4 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="mb-3 text-sm font-semibold">Каналы</div>
        {prefs && (
          <>
            <Toggle label="Push в приложении" on={prefs.push} onClick={() => togglePref('push')} />
            <Toggle label="WhatsApp" on={prefs.whatsapp} onClick={() => togglePref('whatsapp')} />
            <Toggle label="Сервисные статусы" on={prefs.service} onClick={() => togglePref('service')} />
            <Toggle label="Акции и промокоды" on={prefs.promos} onClick={() => togglePref('promos')} />
          </>
        )}
      </div>

      <button type="button" onClick={toggleConsent} className="mt-3 flex w-full items-center justify-between rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4 text-left">
        <span>
          <span className="block text-sm font-semibold">Маркетинговое согласие</span>
          <span className="mt-1 block text-[12px] leading-relaxed text-[#8A7F76]">Выключение останавливает кампании и промо-рассылки.</span>
        </span>
        <span className={`ml-3 flex-shrink-0 rounded-chip px-3 py-1 text-[11px] font-bold ${consentState === 'on' ? 'bg-lime text-lime-ink' : 'bg-[#2E2822] text-[#8A7F76]'}`}>
          {consentState === 'saving' ? '...' : consentState === 'on' ? 'ON' : 'OFF'}
        </span>
      </button>
    </MobileAppFrame>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between border-t border-[#2E2822] py-3 text-left first:border-t-0">
      <span className="text-[13px] text-[#D8CFC6]">{label}</span>
      <span className={`h-6 w-11 rounded-chip p-0.5 transition ${on ? 'bg-lime' : 'bg-[#3A342E]'}`}>
        <span className={`block h-5 w-5 rounded-full bg-white transition ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}
