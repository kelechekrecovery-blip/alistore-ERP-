'use client';

import Link from 'next/link';
import { Banknote, CheckCircle2, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  fetchCourierRun,
  handoverCourierCod,
  type CourierHandoverResult,
  type CourierRunSummary,
} from '@/lib/api';
import { som } from '@/lib/format';
import {
  clearStaffSession,
  restoreStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

const RECEIVER_ROLES = new Set(['cashier', 'admin', 'owner']);

export default function CourierCashPage() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [runId, setRunId] = useState('');
  const [run, setRun] = useState<CourierRunSummary | null>(null);
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const handoverKey = useRef(crypto.randomUUID());

  useEffect(() => {
    void restoreStaffSession().then(setSession);
    setRunId(new URLSearchParams(window.location.search).get('runId')?.trim() ?? '');
  }, []);

  const load = useCallback(async () => {
    if (!session || !RECEIVER_ROLES.has(session.role) || !runId.trim()) return;
    setBusy('load');
    setMessage('');
    try {
      const result = await fetchCourierRun(runId.trim(), session.accessToken);
      setRun(result);
      setAmountText(String(result.collectedTotal));
    } catch (error) {
      setRun(null);
      setMessage(error instanceof Error ? error.message : 'Рейс не найден');
    } finally {
      setBusy('');
    }
  }, [runId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  function logout() {
    clearStaffSession();
    setSession(null);
    setRun(null);
    setMessage('');
  }

  if (!session) {
    return (
      <main className="fixed inset-0 z-50 grid place-items-center bg-[#16130f] p-4">
        <Link href="/courier" className="fixed right-4 top-4 text-sm font-semibold text-white/70 hover:text-white">
          К маршруту
        </Link>
        <StaffSessionLogin
          title="Приёмка COD"
          caption="Войдите под учётной записью кассира."
          onAuthenticated={setSession}
        />
      </main>
    );
  }

  if (!RECEIVER_ROLES.has(session.role)) {
    return (
      <main className="fixed inset-0 z-50 grid place-items-center bg-[#16130f] p-5 text-white">
        <section className="w-full max-w-sm rounded-[8px] border border-white/10 bg-[#211d18] p-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-[#ff7657]" aria-hidden />
          <h1 className="mt-4 font-display text-xl font-bold">Нужен принимающий кассир</h1>
          <p className="mt-2 text-sm text-white/55">COD подтверждает cashier, admin или owner, но не сам курьер.</p>
          <button type="button" onClick={logout} className="mt-5 w-full rounded-[6px] bg-[#c8ff38] px-4 py-3 font-bold text-[#16130f]">
            Войти другим сотрудником
          </button>
        </section>
      </main>
    );
  }

  const amount = /^\d+$/.test(amountText) ? Number(amountText) : null;
  const discrepancy = Boolean(run && amount !== null
    && (amount !== run.collectedTotal || run.collectedTotal !== run.codTotal));

  async function accept() {
    if (!run || amount === null || (discrepancy && !reason.trim())) return;
    setBusy('handover');
    setMessage('');
    try {
      const result = await handoverCourierCod(
        { runId: run.id, amount, ...(reason.trim() ? { reason: reason.trim() } : {}) },
        session!.accessToken,
        handoverKey.current,
      );
      setRun(result);
      handoverKey.current = crypto.randomUUID();
      setMessage('COD принят кассиром и записан в Event Ledger');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'COD не принят');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="min-h-screen bg-[#0e0d0b] px-4 py-6 text-white sm:px-6" data-testid="courier-cash-app">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[6px] bg-[#c8ff38] font-display text-lg font-black text-[#16130f]">A</span>
          <div>
            <strong className="block font-display text-sm">AliStore</strong>
            <span className="text-[10px] font-semibold uppercase text-[#ff7657]">Cash Receiver 3.0</span>
          </div>
          <button type="button" aria-label="Выйти" onClick={logout} className="ml-auto grid h-10 w-10 place-items-center rounded-[6px] border border-white/10 text-white/60">
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <section className="mt-8">
          <p className="text-xs font-semibold uppercase text-[#ff7657]">Двухсторонняя сверка</p>
          <h1 className="mt-1 font-display text-3xl font-black">Приёмка COD</h1>
          <p className="mt-2 text-sm leading-6 text-white/45">Пересчитайте наличные и подтвердите сумму от своего имени.</p>
        </section>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label className="min-w-0 flex-1 text-xs font-semibold text-white/55">
            ID рейса
            <input
              aria-label="ID рейса"
              value={runId}
              onChange={(event) => {
                setRunId(event.target.value);
                setRun(null);
              }}
              className="mt-1.5 h-11 w-full rounded-[6px] border border-white/10 bg-[#16130f] px-3 font-mono text-sm outline-none focus:border-[#c8ff38]"
            />
          </label>
          <button type="submit" aria-label="Загрузить рейс" disabled={busy === 'load' || !runId.trim()} className="mt-[22px] grid h-11 w-11 place-items-center rounded-[6px] bg-[#c8ff38] text-[#16130f] disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </form>

        {run && (
          <article className="mt-5 rounded-[8px] border border-white/10 bg-[#211d18] p-5" data-testid={`cash-run-${run.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">Рейс {run.id.slice(-6)}</h2>
                <p className="mt-1 text-xs text-white/40">Курьер заявил {som(run.collectedTotal)} из {som(run.codTotal)}</p>
              </div>
              <Banknote className="h-6 w-6 text-[#c8ff38]" aria-hidden />
            </div>

            {run.handedOver ? (
              <div className="mt-5 flex items-center gap-3 rounded-[6px] bg-[#c8ff38]/10 p-4 text-sm font-semibold text-[#c8ff38]">
                <CheckCircle2 className="h-5 w-5 flex-none" aria-hidden />
                Уже принято: {som(run.handoverAmount ?? 0)}
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <label className="block text-xs font-semibold text-white/55">
                  Пересчитано кассиром
                  <input
                    aria-label={`Принятая сумма рейса ${run.id}`}
                    value={amountText}
                    onChange={(event) => setAmountText(event.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className="mt-1.5 h-11 w-full rounded-[6px] border border-white/10 bg-[#16130f] px-3 font-mono outline-none focus:border-[#c8ff38]"
                  />
                </label>
                {discrepancy && (
                  <label className="block text-xs font-semibold text-white/55">
                    Причина расхождения
                    <textarea
                      aria-label={`Причина расхождения рейса ${run.id}`}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-1.5 min-h-20 w-full rounded-[6px] border border-white/10 bg-[#16130f] p-3 text-sm outline-none focus:border-[#ff7657]"
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => void accept()}
                  disabled={busy === 'handover' || amount === null || (discrepancy && !reason.trim())}
                  className="h-11 w-full rounded-[6px] bg-[#c8ff38] text-sm font-bold text-[#16130f] disabled:opacity-40"
                >
                  {busy === 'handover' ? 'Принимаем…' : `Принять ${som(amount ?? 0)}`}
                </button>
              </div>
            )}
          </article>
        )}

        {message && <p role="status" className="mt-4 rounded-[6px] border border-white/10 bg-[#16130f] p-3 text-sm text-white/70">{message}</p>}
      </div>
    </main>
  );
}
