'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  decideApproval,
  fetchApprovals,
  staffLogin,
  staffTotpEnable,
  staffTotpSetup,
  type Approval,
  type StaffTotpSetupResult,
} from '@/lib/api';
import { som } from '@/lib/format';
import {
  clearStaffSession,
  loadStaffSession,
  saveStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

const TABS = [
  { status: 'requested', label: 'Ожидают' },
  { status: 'approved', label: 'Одобрено' },
  { status: 'rejected', label: 'Отклонено' },
];

const ACTION_LABEL: Record<string, string> = {
  refund: 'Возврат денег',
  discount: 'Скидка сверх лимита',
  write_off: 'Списание',
  price: 'Изменение цены',
  stock_adjust: 'Изменение остатка',
  debt: 'Продажа в долг',
  delete: 'Удаление товара',
  pii: 'Доступ к PII',
};

export default function ApprovalsPage() {
  const [tab, setTab] = useState(TABS[0]);
  const [items, setItems] = useState<Approval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [session, setSession] = useState<StaffSession | null>(null);
  const [login, setLogin] = useState({ username: '', password: '' });
  const [totpSetup, setTotpSetup] = useState<StaffTotpSetupResult | null>(null);
  const [totpToken, setTotpToken] = useState('');

  useEffect(() => {
    setSession(loadStaffSession());
  }, []);

  const load = useCallback((status: string, token = session?.accessToken) => {
    if (!token) return;
    setItems(null);
    fetchApprovals(status, token)
      .then(setItems)
      .catch(() => {
        setItems([]);
        setSession(null);
        clearStaffSession();
      });
  }, [session?.accessToken]);

  useEffect(() => {
    load(tab.status);
  }, [tab, load, session?.accessToken]);

  function flash(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(''), 1800);
  }

  async function doLogin(e: FormEvent) {
    e.preventDefault();
    setBusy('login');
    try {
      const next = await staffLogin(login.username.trim(), login.password);
      setSession(next);
      saveStaffSession(next);
      flash(`Вход: ${next.role}`);
      load(tab.status, next.accessToken);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка входа');
    } finally {
      setBusy(null);
    }
  }

  async function decide(a: Approval, status: 'approved' | 'rejected') {
    if (!session) return;
    const code = totpToken.trim();
    if (status === 'approved' && !session.totpEnabled) {
      flash('Включите 2FA для одобрения');
      return;
    }
    if (status === 'approved' && !code) {
      flash('Введите код 2FA');
      return;
    }
    setBusy(a.id);
    try {
      await decideApproval(a.id, status, session.accessToken, undefined, status === 'approved' ? code : undefined);
      if (status === 'approved') setTotpToken('');
      flash(status === 'approved' ? 'Одобрено · действие выполнено' : 'Отклонено');
      load(tab.status);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  }

  async function startTotpSetup() {
    if (!session) return;
    setBusy('2fa-setup');
    try {
      setTotpSetup(await staffTotpSetup(session.accessToken));
      flash('Секрет 2FA создан');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка 2FA');
    } finally {
      setBusy(null);
    }
  }

  async function enableTotp(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy('2fa-enable');
    try {
      const profile = await staffTotpEnable(session.accessToken, totpToken.trim());
      const next = { ...session, totpEnabled: profile.totpEnabled };
      setSession(next);
      saveStaffSession(next);
      setTotpSetup(null);
      setTotpToken('');
      flash('2FA включена');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка 2FA');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sand bg-grain">
      <header className="flex items-center gap-4 border-b border-ink/10 bg-white/80 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-warn font-display text-lg font-extrabold text-lime-ink">
          ✓
        </span>
        <div>
          <div className="font-display text-lg font-bold text-ink">Approval Inbox</div>
          <div className="text-xs text-ink/50">Одобрение опасных действий · {session ? session.role : 'требуется вход'}</div>
        </div>
        {session && (
          <button
            type="button"
            onClick={() => {
              clearStaffSession();
              setSession(null);
              setItems(null);
              setTotpSetup(null);
              setTotpToken('');
            }}
            className="ml-auto rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30"
          >
            Выйти staff
          </button>
        )}
        <Link
          href="/"
          className={session ? 'rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30' : 'ml-auto rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30'}
        >
          ⌂ Выйти
        </Link>
      </header>

      {session && (
        <div className="flex flex-shrink-0 gap-2 border-b border-ink/10 bg-white/50 px-6 py-3">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-chip px-4 py-2 text-sm font-semibold transition ${
                tab.status === t.status
                  ? 'bg-ink text-sand'
                  : 'border border-ink/15 bg-white text-ink/70 hover:border-ink/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {!session && (
            <form onSubmit={doLogin} className="rounded-card border border-ink/10 bg-white p-6 shadow-soft">
              <div className="font-display text-xl font-bold text-ink">Вход сотрудника</div>
              <div className="mt-1 text-sm text-ink/55">Введите рабочий логин, чтобы открыть очередь одобрений.</div>
              <input
                value={login.username}
                onChange={(e) => setLogin((v) => ({ ...v, username: e.target.value }))}
                placeholder="username"
                className="mt-5 w-full rounded-btn border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ink/40"
              />
              <input
                value={login.password}
                onChange={(e) => setLogin((v) => ({ ...v, password: e.target.value }))}
                placeholder="password"
                type="password"
                className="mt-3 w-full rounded-btn border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ink/40"
              />
              <button type="submit" disabled={busy === 'login'} className="mt-4 rounded-btn bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-50">
                {busy === 'login' ? 'Входим…' : 'Войти'}
              </button>
            </form>
          )}
          {session && (
            <>
          <div className="mb-4 rounded-card border border-ink/10 bg-white p-4 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-base font-bold text-ink">
                  Step-up 2FA · {session.totpEnabled ? 'включена' : 'требуется'}
                </div>
                <div className="mt-1 text-sm text-ink/55">
                  Для одобрения опасных действий нужен 6-значный код.
                </div>
              </div>
              {!session.totpEnabled && !totpSetup && (
                <button
                  type="button"
                  disabled={busy === '2fa-setup'}
                  onClick={startTotpSetup}
                  className="rounded-btn bg-ink px-4 py-2 text-sm font-semibold text-sand disabled:opacity-50"
                >
                  {busy === '2fa-setup' ? '…' : 'Настроить'}
                </button>
              )}
            </div>
            {totpSetup && !session.totpEnabled && (
              <form onSubmit={enableTotp} className="mt-4 rounded-btn border border-ink/10 bg-sand/60 p-4">
                <div className="text-xs font-semibold uppercase text-ink/45">Secret</div>
                <div className="mt-1 break-all font-mono text-sm text-ink">{totpSetup.secret}</div>
                <div className="mt-3 text-xs font-semibold uppercase text-ink/45">otpauth</div>
                <div className="mt-1 break-all font-mono text-xs text-ink/60">{totpSetup.otpauthUrl}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={totpToken}
                    onChange={(e) => setTotpToken(e.target.value)}
                    inputMode="numeric"
                    placeholder="123456"
                    className="min-w-40 flex-1 rounded-btn border border-ink/15 px-4 py-2.5 font-mono text-sm outline-none focus:border-ink/40"
                  />
                  <button
                    type="submit"
                    disabled={busy === '2fa-enable'}
                    className="rounded-btn bg-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy === '2fa-enable' ? '…' : 'Подтвердить'}
                  </button>
                </div>
              </form>
            )}
            {session.totpEnabled && tab.status === 'requested' && (
              <input
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value)}
                inputMode="numeric"
                placeholder="Код 2FA для одобрения"
                className="mt-4 w-full rounded-btn border border-ink/15 px-4 py-2.5 font-mono text-sm outline-none focus:border-ink/40"
              />
            )}
          </div>
          {items === null && <p className="font-mono text-sm text-ink/40">Загрузка…</p>}
          {items && items.length === 0 && (
            <div className="rounded-card border border-dashed border-ink/15 bg-white/50 px-6 py-16 text-center">
              <p className="font-display text-lg font-bold text-ink">Пусто</p>
              <p className="mt-1 text-sm text-ink/55">Нет заявок в статусе «{tab.label}».</p>
            </div>
          )}
          {items && items.length > 0 && (
            <ul className="flex flex-col gap-3">
              {items.map((a) => {
                const amount = a.evidence?.payload?.amount;
                return (
                  <li key={a.id} className="rounded-card border border-ink/10 bg-white p-5 shadow-soft">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-chip bg-danger/10 px-3 py-1 text-xs font-bold text-danger">
                        {ACTION_LABEL[a.action] ?? a.action}
                      </span>
                      <span className="font-mono text-xs text-ink/45">#{a.id.slice(-8)}</span>
                      <span className="text-sm text-ink/60">от {a.requester}</span>
                      {typeof amount === 'number' && (
                        <span className="ml-auto font-mono text-lg font-bold tabular text-ink">
                          {som(amount)}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-ink/70">Причина: {a.reason}</p>

                    {tab.status === 'requested' ? (
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          disabled={busy === a.id}
                          onClick={() => decide(a, 'approved')}
                          className="rounded-btn bg-success px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                        >
                          {busy === a.id ? '…' : 'Одобрить'}
                        </button>
                        <button
                          type="button"
                          disabled={busy === a.id}
                          onClick={() => decide(a, 'rejected')}
                          className="rounded-btn border border-danger/30 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-50"
                        >
                          Отклонить
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 font-mono text-xs text-ink/40">
                        {a.status} · {a.approver ?? '—'}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-btn bg-ink px-6 py-3 text-sm font-semibold text-sand">
          {toast}
        </div>
      )}
    </div>
  );
}
