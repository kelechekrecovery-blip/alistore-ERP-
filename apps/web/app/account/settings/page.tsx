'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import { deleteAuthJson, fetchMySettings, getJson, updateMySettings, type CustomerSettings } from '@/lib/api';

export default function SettingsPage() {
  const { user, authed, logout } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<CustomerSettings | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function downloadMyData() {
    setExporting(true); setError('');
    try {
      const data = await authed((token) => getJson<unknown>('/customers/me/export', token));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `alistore-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось выгрузить данные');
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true); setError('');
    try {
      await authed((token) => deleteAuthJson<{ id: string; deleted: boolean }>('/customers/me', {}, token));
      await logout();
      router.push('/');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось удалить аккаунт');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <MobileAppFrame title="Настройки" subtitle="Профиль, безопасность и управление данными." backHref="/account">
      {!user && <Link href="/login?next=/account/settings" className="mb-3 block rounded-[13px] border border-surface-3 bg-surface-2 p-4 text-sm text-muted">Войдите по OTP, чтобы изменить профиль.</Link>}
      {error && <div className="mb-3 rounded-[13px] border border-danger-soft/30 bg-surface-2 p-4 text-sm text-danger-soft">{error}</div>}
      {user && !settings && !error && <div className="py-10 text-center text-sm text-muted">Загружаем профиль…</div>}

      <div className="rounded-[14px] border border-surface-3 bg-surface-2 p-4">
        <div className="text-[12px] uppercase text-subtle">Аккаунт</div>
        <div className="mt-2 font-display text-lg font-bold">{settings?.phone ?? user?.phone ?? 'Гость'}</div>
        <div className="mt-1 font-mono text-[11px] text-faint">{user?.customerId ?? 'Войдите по OTP'}</div>
        {settings && <>
          <label htmlFor="customer-name" className="mt-4 block text-[12px] text-muted">Имя</label>
          <input id="customer-name" value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} className="mt-1.5 w-full rounded-[8px] border border-surface-3 bg-ink-dark p-3 text-sm outline-none focus:border-lime" />
          <button type="button" disabled={busy || name.trim() === settings.name} onClick={save} className="mt-3 w-full rounded-[8px] bg-lime py-3 text-sm font-bold text-lime-ink disabled:bg-line disabled:text-faint">{busy ? 'Сохраняем…' : saved ? 'Сохранено' : 'Сохранить профиль'}</button>
        </>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/account/notifications" className="rounded-[14px] border border-surface-3 bg-surface-2 p-4">
          <div className="text-2xl">🔔</div>
          <div className="mt-2 text-[13px] font-semibold">Уведомления</div>
        </Link>
        <Link href="/account/addresses" className="rounded-[14px] border border-surface-3 bg-surface-2 p-4">
          <div className="text-2xl">📍</div>
          <div className="mt-2 text-[13px] font-semibold">Адреса</div>
        </Link>
      </div>

      <div className="mt-3 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
        <div className="text-sm font-semibold">Безопасность</div>
        <div className="mt-2 flex items-center justify-between py-2 text-[13px] text-muted">
          <span>Вход по телефону и OTP</span>
          <span className="text-lime">активен</span>
        </div>
        <div className="flex items-center justify-between border-t border-surface-3 py-2 text-[13px] text-muted">
          <span>Сессия</span>
          <span>обновляется автоматически</span>
        </div>
      </div>

      <div className="mt-3 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
        <div className="text-sm font-semibold">Мои данные</div>
        <div className="mt-1 text-[12px] text-subtle">Выгрузка и удаление персональных данных.</div>
        <button
          type="button"
          disabled={exporting || !user}
          onClick={downloadMyData}
          className="mt-3 w-full rounded-[8px] border border-surface-3 bg-ink-dark py-3 text-sm font-semibold disabled:text-faint"
        >
          {exporting ? 'Готовим файл…' : 'Скачать мои данные'}
        </button>
        {!confirmingDelete ? (
          <button
            type="button"
            disabled={!user}
            onClick={() => setConfirmingDelete(true)}
            className="mt-2 w-full rounded-[8px] border border-danger-soft/30 bg-danger-soft/5 py-3 text-sm font-semibold text-danger-soft disabled:opacity-50"
          >
            Удалить аккаунт
          </button>
        ) : (
          <div className="mt-2 rounded-[8px] border border-danger-soft/30 bg-danger-soft/5 p-3">
            <div className="text-[13px] text-danger-soft">
              Профиль, адреса и сессии будут удалены без восстановления. Заказы и история покупок останутся у магазина — они нужны для бухгалтерии.
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
                className="rounded-[8px] border border-surface-3 bg-ink-dark py-2.5 text-[13px] font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={deleteAccount}
                className="rounded-[8px] bg-danger-soft py-2.5 text-[13px] font-bold text-surface-2 disabled:opacity-50"
              >
                {deleting ? 'Удаляем…' : 'Удалить навсегда'}
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={async () => { await logout(); router.push('/'); }}
        className="mt-4 w-full rounded-[13px] border border-danger-soft/30 bg-danger-soft/5 py-3.5 text-center text-[13px] font-semibold text-danger-soft"
      >
        Выйти из аккаунта
      </button>
    </MobileAppFrame>
  );
}
