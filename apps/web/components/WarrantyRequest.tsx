'use client';

import { useState } from 'react';
import { openWarranty } from '@/lib/warranty';

/** Per-device warranty request on the customer order detail. */
export function WarrantyRequest({ imei, customerId }: { imei: string; customerId: string }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  async function submit() {
    if (!problem.trim()) return;
    setState('sending');
    try {
      await openWarranty({ imei, customerId, problem: problem.trim() });
      setState('done');
    } catch {
      setState('idle');
    }
  }

  if (state === 'done') {
    return <span className="font-mono text-[11px] text-lime">✓ Гарантийное обращение принято</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-chip border border-[#2E2822] px-2.5 py-1 text-[11px] font-medium text-[#8A7F76] transition hover:border-info/40 hover:text-info"
      >
        Заявить гарантию
      </button>
    );
  }

  return (
    <div className="flex w-full items-center gap-2">
      <input
        type="text"
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        placeholder="Опишите проблему…"
        className="flex-1 rounded-btn border border-[#2E2822] bg-[#1A1611] px-3 py-1.5 text-xs outline-none focus:border-info"
        autoFocus
      />
      <button
        type="button"
        disabled={state === 'sending' || !problem.trim()}
        onClick={submit}
        className="rounded-btn bg-info px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {state === 'sending' ? '…' : 'Отправить'}
      </button>
    </div>
  );
}
