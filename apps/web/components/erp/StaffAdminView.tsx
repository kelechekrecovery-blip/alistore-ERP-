'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  STAFF_ROLES,
  changeStaffRole,
  createStaffAccount,
  deactivateStaffAccount,
  fetchHrWeek,
  resetStaffPassword,
  resetStaffTotp,
  type HrStaff,
  type StaffRole,
} from '@/lib/api';

function mondayIso() {
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - day + 1);
  return now.toISOString().slice(0, 10);
}

type PendingAction =
  | { kind: 'deactivate' | 'totp-reset' | 'password-reset'; staff: HrStaff }
  | { kind: 'role'; staff: HrStaff; role: StaffRole }
  | null;

/**
 * UI-STAFF-ADMIN: owner-only staff account admin (STAFF-001/002 API). The account
 * list comes from hr/week (owner holds hr:read); create/deactivate/totp-reset hit
 * the staff:manage endpoints. Deactivation blockers arrive as a 409 message and
 * are shown under the account row.
 */
export function StaffAdminView({ accessToken }: { accessToken: string }) {
  const [staff, setStaff] = useState<HrStaff[] | null>(null);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ username: '', password: '', role: 'seller' as StaffRole, point: 'BISHKEK-1' });

  const reload = useCallback(() => {
    setMessage('');
    fetchHrWeek(mondayIso(), '', accessToken)
      .then((result) => setStaff(result.staff))
      .catch((error) => { setStaff(null); setMessage(error instanceof Error ? error.message : 'Не удалось загрузить учётки'); });
  }, [accessToken]);
  useEffect(() => reload(), [reload]);

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setBusy('create'); setMessage(''); setNotice('');
    try {
      const created = await createStaffAccount({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        point: form.point.trim(),
      }, accessToken);
      setForm((current) => ({ ...current, username: '', password: '' }));
      setNotice(`Учётка ${created.username} создана`);
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать учётку');
    } finally { setBusy(''); }
  }

  async function confirmPending() {
    if (!pending) return;
    const { kind, staff: target } = pending;
    setBusy(target.id); setMessage(''); setNotice('');
    setRowError((current) => ({ ...current, [target.id]: '' }));
    try {
      if (kind === 'deactivate') {
        await deactivateStaffAccount(target.id, accessToken);
        setNotice(`Учётка ${target.username} деактивирована`);
      } else if (kind === 'role') {
        const updated = await changeStaffRole(target.id, pending.role, accessToken);
        setNotice(`Роль ${target.username}: ${updated.role}`);
      } else if (kind === 'password-reset') {
        await resetStaffPassword(target.id, newPassword, accessToken);
        setNewPassword('');
        setNotice(`Пароль ${target.username} сброшен — старые сессии завершены`);
      } else {
        await resetStaffTotp(target.id, accessToken);
        setNotice(`2FA для ${target.username} сброшена — сотрудник настроит её заново при входе`);
      }
      setPending(null);
      reload();
    } catch (error) {
      if ((kind === 'deactivate' || kind === 'role') && error instanceof ApiError && error.status === 409) {
        // STAFF-001 blockers (open shift / active deliveries) and STAFF-004 last_owner_protected.
        setRowError((current) => ({ ...current, [target.id]: error.message }));
        setPending(null);
      } else {
        setMessage(error instanceof Error ? error.message : 'Действие не выполнено');
      }
    } finally { setBusy(''); }
  }

  return (
    <section data-testid="staff-admin" className="rounded-[16px] border border-surface-3 bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-bold">Учётки сотрудников</h3>
          <p className="mt-1 text-xs text-subtle">Создание, деактивация и сброс 2FA. Деактивация блокируется открытой сменой или активными доставками.</p>
        </div>
        <button type="button" onClick={reload} className="rounded-[6px] border border-line px-3 py-2 text-xs text-bright hover:border-lime hover:text-lime">Обновить</button>
      </div>

      {message && <div role="alert" className="mt-3 rounded-[6px] border border-coral-soft/40 bg-coral-soft/10 px-3 py-2 text-xs text-coral-tint">{message}</div>}
      {notice && <div role="status" className="mt-3 rounded-[6px] border border-lime/30 bg-lime/10 px-3 py-2 text-xs text-lime">{notice}</div>}

      <form onSubmit={submitCreate} className="mt-4 grid gap-2 rounded-[10px] border border-surface-3 bg-ink-dark p-3 sm:grid-cols-[1fr_1fr_160px_140px_auto]">
        <input aria-label="Логин" placeholder="Логин" required value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} className="h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" />
        <input aria-label="Пароль" placeholder="Пароль" type="password" required value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" />
        <select aria-label="Роль" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as StaffRole }))} className="h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white">
          {STAFF_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        <input aria-label="Точка" placeholder="Точка" required value={form.point} onChange={(event) => setForm((current) => ({ ...current, point: event.target.value }))} className="h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" />
        <button type="submit" disabled={busy === 'create'} className="h-9 rounded-[6px] bg-lime px-4 text-xs font-bold text-[#1A2300] disabled:opacity-60">{busy === 'create' ? '…' : 'Создать'}</button>
      </form>

      {staff === null && !message && <p className="mt-4 font-mono text-xs text-subtle">Загрузка…</p>}
      {staff?.length === 0 && <p className="mt-4 text-xs text-subtle">Активных учёток нет</p>}
      <ul className="mt-3 divide-y divide-surface-2">
        {(staff ?? []).map((person) => (
          <li key={person.id} className="py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">{person.username}</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-lime">{person.role}</span>
              <span className="ml-auto flex flex-wrap gap-2">
                <select
                  aria-label={`Роль ${person.username}`}
                  value={person.role}
                  disabled={busy === person.id}
                  onChange={(event) => setPending({ kind: 'role', staff: person, role: event.target.value as StaffRole })}
                  className="h-8 rounded-[6px] border border-line bg-surface px-2 text-[11px] text-white"
                >
                  {STAFF_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <button
                  type="button"
                  disabled={busy === person.id}
                  onClick={() => setPending({ kind: 'password-reset', staff: person })}
                  className="rounded-[6px] border border-line px-2.5 py-1.5 text-[11px] text-bright hover:border-lime hover:text-lime disabled:opacity-50"
                >Сбросить пароль</button>
                <button
                  type="button"
                  disabled={busy === person.id}
                  onClick={() => setPending({ kind: 'totp-reset', staff: person })}
                  className="rounded-[6px] border border-line px-2.5 py-1.5 text-[11px] text-bright hover:border-lime hover:text-lime disabled:opacity-50"
                >Сбросить 2FA</button>
                <button
                  type="button"
                  disabled={busy === person.id}
                  onClick={() => setPending({ kind: 'deactivate', staff: person })}
                  className="rounded-[6px] border border-line px-2.5 py-1.5 text-[11px] text-danger-soft hover:border-coral-soft disabled:opacity-50"
                >Деактивировать</button>
              </span>
            </div>
            {pending?.staff.id === person.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[8px] border border-coral-soft/40 bg-coral-soft/10 px-3 py-2">
                <span className="text-xs text-coral-tint">
                  {pending.kind === 'deactivate' && `Деактивировать ${person.username}? Доступ отключится сразу.`}
                  {pending.kind === 'totp-reset' && `Сбросить 2FA для ${person.username}? Текущий authenticator перестанет работать.`}
                  {pending.kind === 'role' && `Сменить роль ${person.username}: ${person.role} → ${pending.role}?`}
                  {pending.kind === 'password-reset' && `Новый пароль для ${person.username} (старые сессии завершатся):`}
                </span>
                {pending.kind === 'password-reset' && (
                  <input
                    aria-label="Новый пароль"
                    type="password"
                    placeholder="Минимум 8 символов"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="h-8 rounded-[6px] border border-line bg-surface px-2 text-xs text-white"
                  />
                )}
                <button type="button" disabled={busy === person.id || (pending.kind === 'password-reset' && newPassword.length < 8)} onClick={confirmPending} className="ml-auto rounded-[6px] bg-coral-soft px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
                  {busy === person.id ? '…' : 'Подтвердить'}
                </button>
                <button type="button" onClick={() => { setPending(null); setNewPassword(''); }} className="rounded-[6px] border border-line px-3 py-1.5 text-[11px] text-bright">Отмена</button>
              </div>
            )}
            {rowError[person.id] && (
              <div role="alert" className="mt-2 rounded-[8px] border border-coral-soft/40 bg-coral-soft/10 px-3 py-2 text-xs text-coral-tint">{rowError[person.id]}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
