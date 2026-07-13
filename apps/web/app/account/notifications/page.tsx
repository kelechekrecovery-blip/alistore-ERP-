'use client';

import { useEffect, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import { fetchMySettings, updateMySettings, type CustomerSettings } from '@/lib/api';

const notifications = [
  { icon: '📦', title: 'Заказ собирается', text: 'Скоро передадим курьеру', time: '5 мин назад', bg: '#221E19' },
  { icon: '🏷', title: 'Цена снизилась', text: 'Apple Watch S9 дешевле на 5 000 с', time: '1 ч назад', bg: '#16130F' },
  { icon: '🛡', title: 'Гарантия скоро истекает', text: 'AirPods Pro — осталось 12 дней', time: 'вчера', bg: '#16130F' },
  { icon: '🎁', title: 'Начислены бонусы', text: '+300 за отзыв', time: '2 дня назад', bg: '#16130F' },
];

export default function NotificationsPage() {
  const { user, authed } = useAuth();
  const [settings, setSettings] = useState<CustomerSettings | null>(null);
  const [saving, setSaving] = useState<keyof CustomerSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    authed(fetchMySettings).then(setSettings).catch(() => setError('Не удалось загрузить настройки связи'));
  }, [user, authed]);

  async function toggle(key: 'push' | 'whatsapp' | 'service' | 'promos' | 'consent') {
    if (!settings || saving) return;
    const previous = settings;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next); setSaving(key); setError('');
    try {
      setSettings(await authed((token) => updateMySettings({ [key]: next[key] }, token)));
    } catch {
      setSettings(previous); setError('Не удалось сохранить настройку');
    } finally {
      setSaving(null);
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

      {!user && <a href="/login?next=/account/notifications" className="mt-4 block rounded-[13px] border border-[#2E2822] bg-[#221E19] p-4 text-sm text-[#A79C92]">Войдите по OTP, чтобы синхронизировать каналы.</a>}
      {error && <div className="mt-3 rounded-[13px] border border-[#FF8A7A]/30 bg-[#221E19] p-4 text-sm text-[#FF8A7A]">{error}</div>}

      <div className="mt-4 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="mb-3 text-sm font-semibold">Каналы</div>
        {settings && (
          <>
            <Toggle label="Push в приложении" on={settings.push} disabled={Boolean(saving)} onClick={() => toggle('push')} />
            <Toggle label="WhatsApp" on={settings.whatsapp} disabled={Boolean(saving)} onClick={() => toggle('whatsapp')} />
            <Toggle label="Сервисные статусы" on={settings.service} disabled={Boolean(saving)} onClick={() => toggle('service')} />
            <Toggle label="Акции и промокоды" on={settings.promos} disabled={Boolean(saving)} onClick={() => toggle('promos')} />
          </>
        )}
        {user && !settings && !error && <div className="py-5 text-center text-sm text-[#A79C92]">Загружаем каналы…</div>}
      </div>

      <button type="button" disabled={!settings || Boolean(saving)} onClick={() => toggle('consent')} className="mt-3 flex w-full items-center justify-between rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4 text-left disabled:opacity-60">
        <span>
          <span className="block text-sm font-semibold">Маркетинговое согласие</span>
          <span className="mt-1 block text-[12px] leading-relaxed text-[#8A7F76]">Выключение останавливает кампании и промо-рассылки.</span>
        </span>
        <span className={`ml-3 flex-shrink-0 rounded-chip px-3 py-1 text-[11px] font-bold ${settings?.consent ? 'bg-lime text-lime-ink' : 'bg-[#2E2822] text-[#8A7F76]'}`}>
          {saving === 'consent' ? '...' : settings?.consent ? 'ON' : 'OFF'}
        </span>
      </button>
    </MobileAppFrame>
  );
}

function Toggle({ label, on, disabled, onClick }: { label: string; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center justify-between border-t border-[#2E2822] py-3 text-left first:border-t-0 disabled:opacity-60">
      <span className="text-[13px] text-[#D8CFC6]">{label}</span>
      <span className={`h-6 w-11 rounded-chip p-0.5 transition ${on ? 'bg-lime' : 'bg-[#3A342E]'}`}>
        <span className={`block h-5 w-5 rounded-full bg-white transition ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}
