'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { fetchWarranty, transitionWarranty, type WarrantyCase } from '@/lib/warranty';
import { downloadWarrantyTalon } from '@/lib/api';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { clearStaffSession, loadStaffSession, type StaffSession } from '@/lib/staff-session';

interface Stage {
  status: string;
  label: string;
  to: string;
  action: string;
}

const STAGES: Stage[] = [
  { status: 'created', label: 'Новые', to: 'received', action: 'Принять' },
  { status: 'received', label: 'Принято', to: 'diagnostics', action: 'На диагностику' },
  { status: 'diagnostics', label: 'Диагностика', to: 'approved', action: 'Одобрить ремонт' },
  { status: 'waiting_supplier', label: 'Ждём поставщика', to: 'approved', action: 'Одобрить' },
  { status: 'approved', label: 'Одобрено', to: 'repaired', action: 'Отремонтировано' },
];

export default function WarrantyConsolePage() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<Stage>(STAGES[0]);
  const [cases, setCases] = useState<WarrantyCase[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback((s: Stage) => {
    if (!session) return;
    setCases(null);
    fetchWarranty({ status: s.status, accessToken: session.accessToken })
      .then(setCases)
      .catch(() => setCases([]));
  }, [session]);

  useEffect(() => {
    setSession(loadStaffSession());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (session) load(stage);
  }, [stage, load, session]);

  function flash(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(''), 1800);
  }

  async function advance(wc: WarrantyCase) {
    if (!session) return;
    setBusy(wc.id);
    try {
      await transitionWarranty(wc.id, stage.to, session.accessToken);
      flash(`Гарантия ${wc.imei} → ${stage.to}`);
      load(stage);
    } catch {
      flash('Ошибка перехода');
    } finally {
      setBusy(null);
    }
  }

  async function downloadTalon(wc: WarrantyCase) {
    if (!session) return;
    setBusy(`talon-${wc.id}`);
    try {
      await downloadWarrantyTalon(wc.imei, session.accessToken);
      flash('Гарантийный талон скачан');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка талона');
    } finally {
      setBusy(null);
    }
  }

  function logout() {
    clearStaffSession();
    setSession(null);
    setCases(null);
  }

  if (!hydrated) {
    return <div className="fixed inset-0 z-50 bg-[#0E0C0A]" />;
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#0E0C0A] px-4">
        <StaffSessionLogin
          title="Гарантия · вход"
          caption="Нужна роль склада или администратора."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0E0C0A]">
      <header className="flex items-center gap-4 border-b border-[#2E2822] bg-[#16130F]/90 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-info font-display text-lg font-extrabold text-white">
          🛡
        </span>
        <div>
          <div className="font-display text-lg font-bold text-white">Гарантия · Обращения</div>
          <div className="text-xs text-[#8A7F76]">
            {session.username} · {session.role} · SLA 14 дней
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="ml-auto rounded-chip border border-[#2E2822] px-4 py-2 text-sm font-medium text-[#8A7F76] hover:border-[#2E2822]"
        >
          Выйти staff
        </button>
        <Link href="/" className="rounded-chip border border-[#2E2822] px-4 py-2 text-sm font-medium text-[#8A7F76] hover:border-[#2E2822]">
          ⌂ Выйти
        </Link>
      </header>

      <div className="flex flex-shrink-0 gap-2 overflow-x-auto border-b border-[#2E2822] bg-[#1A1611] px-6 py-3">
        {STAGES.map((s) => (
          <button
            key={s.status}
            type="button"
            onClick={() => setStage(s)}
            className={`flex-shrink-0 rounded-chip px-4 py-2 text-sm font-semibold transition ${
              stage.status === s.status ? 'bg-lime text-lime-ink' : 'border border-[#2E2822] bg-[#1A1611] text-[#8A7F76] hover:border-[#2E2822]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {cases === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
          {cases && cases.length === 0 && (
            <div className="rounded-card border border-dashed border-[#2E2822] bg-[#1A1611] px-6 py-16 text-center">
              <p className="font-display text-lg font-bold text-white">Пусто</p>
              <p className="mt-1 text-sm text-[#8A7F76]">Нет обращений в статусе «{stage.label}».</p>
            </div>
          )}
          {cases && cases.length > 0 && (
            <ul className="flex flex-col gap-3">
              {cases.map((wc) => {
                const overdue = new Date(wc.sla).getTime() < Date.now();
                return (
                  <li key={wc.id} className="rounded-card border border-[#2E2822] bg-[#1A1611] p-5 ">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-white">{wc.imei}</span>
                      <span className={`rounded-chip px-2.5 py-0.5 text-xs font-semibold ${overdue ? 'bg-danger/10 text-danger' : 'bg-[#221E19] text-lime'}`}>
                        SLA {new Date(wc.sla).toLocaleDateString('ru-RU')}{overdue ? ' · просрочено' : ''}
                      </span>
                      <span className="font-mono text-xs text-[#8A7F76]">#{wc.id.slice(-8)}</span>
                    </div>
                    <p className="mt-2 text-sm text-[#8A7F76]">Проблема: {wc.problem}</p>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy === `talon-${wc.id}`}
                        onClick={() => downloadTalon(wc)}
                        className="rounded-btn border border-[#2E2822] bg-[#221E19] px-4 py-2 text-sm font-semibold text-[#D8CFC6] transition hover:border-[#3A342E] disabled:text-[#6E645C]"
                      >
                        {busy === `talon-${wc.id}` ? '…' : 'Талон'}
                      </button>
                      <button
                        type="button"
                        disabled={busy === wc.id}
                        onClick={() => advance(wc)}
                        className="rounded-btn bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-deep disabled:bg-[#2E2822]"
                      >
                        {busy === wc.id ? '…' : stage.action}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {toast && (
        <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-btn bg-lime px-6 py-3 text-sm font-semibold text-lime-ink">
          {toast}
        </div>
      )}
    </div>
  );
}
