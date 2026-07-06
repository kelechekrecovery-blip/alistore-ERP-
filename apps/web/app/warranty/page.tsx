'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { fetchWarranty, transitionWarranty, type WarrantyCase } from '@/lib/warranty';

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
  const [stage, setStage] = useState<Stage>(STAGES[0]);
  const [cases, setCases] = useState<WarrantyCase[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback((s: Stage) => {
    setCases(null);
    fetchWarranty({ status: s.status })
      .then(setCases)
      .catch(() => setCases([]));
  }, []);

  useEffect(() => {
    load(stage);
  }, [stage, load]);

  function flash(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(''), 1800);
  }

  async function advance(wc: WarrantyCase) {
    setBusy(wc.id);
    try {
      await transitionWarranty(wc.id, stage.to);
      flash(`Гарантия ${wc.imei} → ${stage.to}`);
      load(stage);
    } catch {
      flash('Ошибка перехода');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sand bg-grain">
      <header className="flex items-center gap-4 border-b border-ink/10 bg-white/80 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-info font-display text-lg font-extrabold text-white">
          🛡
        </span>
        <div>
          <div className="font-display text-lg font-bold text-ink">Гарантия · Обращения</div>
          <div className="text-xs text-ink/50">Привязано к IMEI · SLA 14 дней</div>
        </div>
        <Link href="/" className="ml-auto rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30">
          ⌂ Выйти
        </Link>
      </header>

      <div className="flex flex-shrink-0 gap-2 overflow-x-auto border-b border-ink/10 bg-white/50 px-6 py-3">
        {STAGES.map((s) => (
          <button
            key={s.status}
            type="button"
            onClick={() => setStage(s)}
            className={`flex-shrink-0 rounded-chip px-4 py-2 text-sm font-semibold transition ${
              stage.status === s.status ? 'bg-ink text-sand' : 'border border-ink/15 bg-white text-ink/70 hover:border-ink/30'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {cases === null && <p className="font-mono text-sm text-ink/40">Загрузка…</p>}
          {cases && cases.length === 0 && (
            <div className="rounded-card border border-dashed border-ink/15 bg-white/50 px-6 py-16 text-center">
              <p className="font-display text-lg font-bold text-ink">Пусто</p>
              <p className="mt-1 text-sm text-ink/55">Нет обращений в статусе «{stage.label}».</p>
            </div>
          )}
          {cases && cases.length > 0 && (
            <ul className="flex flex-col gap-3">
              {cases.map((wc) => {
                const overdue = new Date(wc.sla).getTime() < Date.now();
                return (
                  <li key={wc.id} className="rounded-card border border-ink/10 bg-white p-5 shadow-soft">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-ink">{wc.imei}</span>
                      <span className={`rounded-chip px-2.5 py-0.5 text-xs font-semibold ${overdue ? 'bg-danger/10 text-danger' : 'bg-tint text-deep'}`}>
                        SLA {new Date(wc.sla).toLocaleDateString('ru-RU')}{overdue ? ' · просрочено' : ''}
                      </span>
                      <span className="font-mono text-xs text-ink/45">#{wc.id.slice(-8)}</span>
                    </div>
                    <p className="mt-2 text-sm text-ink/70">Проблема: {wc.problem}</p>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        disabled={busy === wc.id}
                        onClick={() => advance(wc)}
                        className="rounded-btn bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-deep disabled:bg-ink/20"
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
        <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-btn bg-ink px-6 py-3 text-sm font-semibold text-sand">
          {toast}
        </div>
      )}
    </div>
  );
}
