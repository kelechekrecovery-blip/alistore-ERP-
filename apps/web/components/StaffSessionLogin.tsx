'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchCheckoutOptions, staffBootstrapNeeded, staffBootstrapOwner, staffLogin, type StorePoint } from '@/lib/api';
import { saveStaffSession, type StaffSession } from '@/lib/staff-session';

export function StaffSessionLogin({
  mode = 'dark',
  title = 'Вход сотрудника',
  caption = 'Введите рабочий логин.',
  onAuthenticated,
}: {
  mode?: 'dark' | 'light';
  title?: string;
  caption?: string;
  onAuthenticated: (session: StaffSession) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // При пустой базе (seed не создаёт учёток) показываем создание первого
  // владельца вместо тупика на форме логина. null — статус ещё неизвестен.
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [points, setPoints] = useState<StorePoint[]>([]);
  const dark = mode === 'dark';

  useEffect(() => {
    let active = true;
    staffBootstrapNeeded().then(async (needed) => {
      if (!active) return;
      setNeedsBootstrap(needed);
      if (needed) {
        const options = await fetchCheckoutOptions(new Date().toISOString().slice(0, 10)).catch(() => null);
        if (active) setPoints(options?.pickupPoints ?? []);
      }
    });
    return () => { active = false; };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const values = new FormData(e.currentTarget as HTMLFormElement);
    const username = String(values.get('username') ?? '').trim();
    const password = String(values.get('password') ?? '');
    const totp = String(values.get('totp') ?? '').trim();
    const point = String(values.get('point') ?? '');
    try {
      const session = needsBootstrap
        ? await staffBootstrapOwner(username, password, point)
        : await staffLogin(username, password, totp);
      saveStaffSession(session);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : needsBootstrap ? 'Не удалось создать владельца' : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={
        dark
          ? 'w-full max-w-sm rounded-[18px] border border-surface-3 bg-surface p-5 text-white shadow-2xl'
          : 'w-full max-w-sm rounded-card border border-ink/10 bg-white p-6 text-ink shadow-soft'
      }
    >
      <div className="font-display text-xl font-bold">{needsBootstrap ? 'Создание владельца' : title}</div>
      <div className={dark ? 'mt-1 text-sm text-subtle' : 'mt-1 text-sm text-ink/55'}>
        {needsBootstrap
          ? 'В системе ещё нет сотрудников. Придумайте логин и пароль владельца (не короче 8 символов) — это первый и единственный раз.'
          : caption}
      </div>
      <input
        name="username"
        placeholder="username"
        autoComplete="username"
        className={
          dark
            ? 'mt-5 w-full rounded-[11px] border border-surface-3 bg-ink-dark px-4 py-3 text-sm text-white outline-none placeholder:text-faint focus:border-lime'
            : 'mt-5 w-full rounded-btn border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ink/40'
        }
      />
      {needsBootstrap && (
        <select
          name="point"
          required
          defaultValue=""
          className={
            dark
              ? 'mt-3 w-full rounded-[11px] border border-surface-3 bg-ink-dark px-4 py-3 text-sm text-white outline-none focus:border-lime'
              : 'mt-3 w-full rounded-btn border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ink/40'
          }
        >
          <option value="" disabled>Выберите активную точку</option>
          {points.map((point) => (
            <option key={point.id} value={point.id}>{point.name} · {point.inventoryLocation}</option>
          ))}
        </select>
      )}
      <input
        name="password"
        placeholder="password"
        type="password"
        autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
        className={
          dark
            ? 'mt-3 w-full rounded-[11px] border border-surface-3 bg-ink-dark px-4 py-3 text-sm text-white outline-none placeholder:text-faint focus:border-lime'
            : 'mt-3 w-full rounded-btn border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ink/40'
        }
      />
      {!needsBootstrap && (
        <input
          name="totp"
          placeholder="Код 2FA, если включён"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={16}
          className={
            dark
              ? 'mt-3 w-full rounded-[11px] border border-surface-3 bg-ink-dark px-4 py-3 text-sm text-white outline-none placeholder:text-faint focus:border-lime'
              : 'mt-3 w-full rounded-btn border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ink/40'
          }
        />
      )}
      {error && <div className={dark ? 'mt-3 text-sm text-danger-soft' : 'mt-3 text-sm text-danger'}>{error}</div>}
      <button
        type="submit"
        disabled={busy}
        className={
          dark
            ? 'mt-4 w-full rounded-[11px] bg-lime px-5 py-3 text-sm font-bold text-lime-ink disabled:opacity-50'
            : 'mt-4 rounded-btn bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-50'
        }
      >
        {busy ? (needsBootstrap ? 'Создаём…' : 'Входим…') : needsBootstrap ? 'Создать владельца' : 'Войти'}
      </button>
    </form>
  );
}
