'use client';

import { useEffect, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import {
  fetchMyNotifications,
  fetchMySettings,
  markNotificationRead,
  updateMySettings,
  type CustomerNotification,
  type CustomerSettings,
} from '@/lib/api';

export default function NotificationsPage() {
  const { user, authed } = useAuth();
  const [settings, setSettings] = useState<CustomerSettings | null>(null);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [saving, setSaving] = useState<keyof CustomerSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([authed(fetchMySettings), authed(fetchMyNotifications)])
      .then(([nextSettings, nextNotifications]) => {
        setSettings(nextSettings);
        setNotifications(nextNotifications);
      })
      .catch(() => setError('Не удалось загрузить уведомления и настройки связи'));
  }, [user, authed]);

  async function readNotification(notification: CustomerNotification) {
    if (notification.readAt) return;
    try {
      const updated = await authed((token) => markNotificationRead(notification.id, token));
      setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setError('Не удалось отметить уведомление прочитанным');
    }
  }

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
      {user ? (
        <div className="mb-3 space-y-2">
          {notifications.length === 0 && <div className="rounded-[13px] border border-surface-3 bg-surface-2 p-4 text-sm text-muted">Новых уведомлений пока нет.</div>}
          {notifications.map((notification) => (
            <button
              type="button"
              key={notification.id}
              onClick={() => readNotification(notification)}
              className={`block w-full rounded-[13px] border p-4 text-left transition ${notification.readAt ? 'border-surface-3 bg-surface-2' : 'border-lime/40 bg-lime/10'}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm font-semibold text-bright">{notification.title}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted">{notification.detail}</span>
                </span>
                {!notification.readAt && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-lime" aria-label="Новое уведомление" />}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-3 rounded-[13px] border border-surface-3 bg-surface-2 p-4 text-sm text-muted">Войдите по OTP, чтобы увидеть персональные уведомления.</div>
      )}
      {!user && <a href="/login?next=/account/notifications" className="mb-4 block rounded-[13px] border border-surface-3 bg-surface-2 p-4 text-sm text-muted">Войти в аккаунт</a>}
      {error && <div className="mt-3 rounded-[13px] border border-danger-soft/30 bg-surface-2 p-4 text-sm text-danger-soft">{error}</div>}

      <div className="mt-4 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
        <div className="mb-3 text-sm font-semibold">Каналы</div>
        {settings && (
          <>
            <Toggle label="Push в приложении" on={settings.push} disabled={Boolean(saving)} onClick={() => toggle('push')} />
            <Toggle label="WhatsApp" on={settings.whatsapp} disabled={Boolean(saving)} onClick={() => toggle('whatsapp')} />
            <Toggle label="Сервисные статусы" on={settings.service} disabled={Boolean(saving)} onClick={() => toggle('service')} />
            <Toggle label="Акции и промокоды" on={settings.promos} disabled={Boolean(saving)} onClick={() => toggle('promos')} />
          </>
        )}
        {user && !settings && !error && <div className="py-5 text-center text-sm text-muted">Загружаем каналы…</div>}
      </div>

      <button type="button" disabled={!settings || Boolean(saving)} onClick={() => toggle('consent')} className="mt-3 flex w-full items-center justify-between rounded-[14px] border border-surface-3 bg-surface-2 p-4 text-left disabled:opacity-60">
        <span>
          <span className="block text-sm font-semibold">Маркетинговое согласие</span>
          <span className="mt-1 block text-[12px] leading-relaxed text-subtle">Выключение останавливает кампании и промо-рассылки.</span>
        </span>
        <span className={`ml-3 flex-shrink-0 rounded-chip px-3 py-1 text-[11px] font-bold ${settings?.consent ? 'bg-lime text-lime-ink' : 'bg-surface-3 text-subtle'}`}>
          {saving === 'consent' ? '...' : settings?.consent ? 'ON' : 'OFF'}
        </span>
      </button>
    </MobileAppFrame>
  );
}

function Toggle({ label, on, disabled, onClick }: { label: string; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center justify-between border-t border-surface-3 py-3 text-left first:border-t-0 disabled:opacity-60">
      <span className="text-[13px] text-bright">{label}</span>
      <span className={`h-6 w-11 rounded-chip p-0.5 transition ${on ? 'bg-lime' : 'bg-line'}`}>
        <span className={`block h-5 w-5 rounded-full bg-white transition ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}
