'use client';

import { useRef, useState } from 'react';
import { uploadEvidenceImages } from '@/lib/api';
import { openWarranty } from '@/lib/warranty';
import { EvidencePicker } from './EvidencePicker';
import { useAuth } from '@/lib/auth';

/** Per-device warranty request on the customer order detail. */
export function WarrantyRequest({ imei, customerId }: { imei: string; customerId: string }) {
  const { authed } = useAuth();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [evidenceCount, setEvidenceCount] = useState(0);
  const idempotencyKey = useRef(crypto.randomUUID());

  async function submit() {
    if (!problem.trim()) return;
    setState('sending');
    try {
      const warranty = await authed((accessToken) => openWarranty(
        { imei, customerId, problem: problem.trim() },
        { accessToken, idempotencyKey: idempotencyKey.current },
      ));
      const evidence = files.length
        ? await uploadEvidenceImages({
            files,
            entityType: 'warranty',
            entityId: warranty.id,
            label: 'defect_photo',
            actor: customerId,
            accessToken: await authed(async (token) => token),
          })
        : [];
      setEvidenceCount(evidence.length);
      setState('done');
    } catch {
      setState('idle');
    }
  }

  if (state === 'done') {
    return <span className="font-mono text-[11px] text-lime">✓ Гарантийное обращение принято · фото {evidenceCount}</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-chip border border-surface-3 px-2.5 py-1 text-[11px] font-medium text-subtle transition hover:border-info/40 hover:text-info"
      >
        Заявить гарантию
      </button>
    );
  }

  return (
    <div className="w-full">
      <div className="flex w-full items-center gap-2">
      <input
        type="text"
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        placeholder="Опишите проблему…"
        className="flex-1 rounded-btn border border-surface-3 bg-surface px-3 py-1.5 text-xs text-white outline-none placeholder:text-faint focus:border-info"
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
      <div className="mt-2">
        <EvidencePicker files={files} onChange={setFiles} label="Фото дефекта" hint="Экран, корпус, IMEI/SN или ошибка" max={3} />
      </div>
    </div>
  );
}
