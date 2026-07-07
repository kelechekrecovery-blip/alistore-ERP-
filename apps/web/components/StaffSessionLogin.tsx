'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { staffLogin } from '@/lib/api';
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
  const [form, setForm] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dark = mode === 'dark';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await staffLogin(form.username.trim(), form.password);
      saveStaffSession(session);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={
        dark
          ? 'w-full max-w-sm rounded-[18px] border border-[#2E2822] bg-[#1A1611] p-5 text-white shadow-2xl'
          : 'w-full max-w-sm rounded-card border border-ink/10 bg-white p-6 text-ink shadow-soft'
      }
    >
      <div className="font-display text-xl font-bold">{title}</div>
      <div className={dark ? 'mt-1 text-sm text-[#8A7F76]' : 'mt-1 text-sm text-ink/55'}>
        {caption}
      </div>
      <input
        value={form.username}
        onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))}
        placeholder="username"
        className={
          dark
            ? 'mt-5 w-full rounded-[11px] border border-[#2E2822] bg-[#16130F] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime'
            : 'mt-5 w-full rounded-btn border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ink/40'
        }
      />
      <input
        value={form.password}
        onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))}
        placeholder="password"
        type="password"
        className={
          dark
            ? 'mt-3 w-full rounded-[11px] border border-[#2E2822] bg-[#16130F] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime'
            : 'mt-3 w-full rounded-btn border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ink/40'
        }
      />
      {error && <div className={dark ? 'mt-3 text-sm text-[#FF8A7A]' : 'mt-3 text-sm text-danger'}>{error}</div>}
      <button
        type="submit"
        disabled={busy}
        className={
          dark
            ? 'mt-4 w-full rounded-[11px] bg-lime px-5 py-3 text-sm font-bold text-lime-ink disabled:opacity-50'
            : 'mt-4 rounded-btn bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-50'
        }
      >
        {busy ? 'Входим…' : 'Войти'}
      </button>
    </form>
  );
}
