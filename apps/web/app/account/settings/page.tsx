'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import { fetchMySettings, updateMySettings, type CustomerSettings } from '@/lib/api';

export default function SettingsPage() {
  const { user, authed, logout } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<CustomerSettings | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const reload = useCallback(() => {
    if (!user) return Promise.resolve();
    setError('');
    return authed(fetchMySettings)
      .then((value) => { setSettings(value); setName(value.name); })
      .catch((value: unknown) => setError(value instanceof Error ? value.message : 'Не удалось загрузить настройки'));
  }, [user, authed]);

  useEffect(() => { void reload(); }, [reload]);

  async function save() {
    if (!settings) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const next = await authed((token) => updateMySettings({ name: name.trim() }, token));
      setSettings(next); setName(next.name); setSaved(true);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось сохранить настройки');
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileAppFrame title="Настройки" subtitle="Профиль, безопасность и управление данными." backHref="/account">
      {!user && <Link href="/login?next=/account/settings" className="mb-3 block rounded-[13px] border border-[#2E2822] bg-[#221E19] p-4 text-sm text-[#A79C92]">Войдите по OTP, чтобы изменить профиль.</Link>}
      {error && <div className="mb-3 rounded-[13px] border border-[#FF8A7A]/30 bg-[#221E19] p-4 text-sm text-[#FF8A7A]">{error}</div>}
      {user && !settings && !error && <div className="py-10 text-center text-sm text-[#A79C92]">Загружаем профиль…</div>}

      <div className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="text-[12px] uppercase text-[#8A7F76]">Аккаунт</div>
        <div className="mt-2 font-display text-lg font-bold">{settings?.phone ?? user?.phone ?? 'Гость'}</div>
        <div className="mt-1 font-mono text-[11px] text-[#6E645C]">{user?.customerId ?? 'Войдите по OTP'}</div>
        {settings && <>
          <label htmlFor="customer-name" className="mt-4 block text-[12px] text-[#A79C92]">Имя</label>
          <input id="customer-name" value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} className="mt-1.5 w-full rounded-[8px] border border-[#2E2822] bg-[#16130F] p-3 text-sm outline-none focus:border-lime" />
          <button type="button" disabled={busy || name.trim() === settings.name} onClick={save} className="mt-3 w-full rounded-[8px] bg-lime py-3 text-sm font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">{busy ? 'Сохраняем…' : saved ? 'Сохранено' : 'Сохранить профиль'}</button>
        </>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/account/notifications" className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
          <div className="text-2xl">🔔</div>
          <div className="mt-2 text-[13px] font-semibold">Уведомления</div>
        </Link>
        <Link href="/account/addresses" className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
          <div className="text-2xl">📍</div>
          <div className="mt-2 text-[13px] font-semibold">Адреса</div>
        </Link>
      </div>

      <div className="mt-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="text-sm font-semibold">Безопасность</div>
        <div className="mt-2 flex items-center justify-between py-2 text-[13px] text-[#A79C92]">
          <span>Вход по телефону и OTP</span>
          <span className="text-lime">активен</span>
        </div>
        <div className="flex items-center justify-between border-t border-[#2E2822] py-2 text-[13px] text-[#A79C92]">
          <span>Сессия</span>
          <span>обновляется автоматически</span>
        </div>
      </div>

      <button
        type="button"
        onClick={async () => { await logout(); router.push('/'); }}
        className="mt-4 w-full rounded-[13px] border border-[#FF8A7A]/30 bg-[#FF8A7A]/5 py-3.5 text-center text-[13px] font-semibold text-[#FF8A7A]"
      >
        Выйти из аккаунта
      </button>
    </MobileAppFrame>
  );
}
