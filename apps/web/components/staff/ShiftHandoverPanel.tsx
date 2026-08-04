'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchHandoverTargets, handoverShift, type HandoverTarget } from '@/lib/staff';

/**
 * Hand the open cash drawer to a colleague at the same point. The receiver list
 * comes from GET /shifts/handover-targets (active colleagues, no owner roster
 * needed). Counted cash is the physical count before handover; the server
 * reconciles it and may require a reason on a variance.
 */
export function ShiftHandoverPanel({
  shiftId,
  accessToken,
  onDone,
}: {
  shiftId: string;
  accessToken: string;
  onDone: () => void;
}) {
  const [targets, setTargets] = useState<HandoverTarget[]>([]);
  const [toStaffId, setToStaffId] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  // A failed request used to land in the same empty list as "no colleagues on
  // shift", so the panel told a cashier holding a drawer that there was nobody
  // to hand it to. Those are different situations and only one of them is the
  // cashier's problem to solve.
  const loadTargets = useCallback(() => {
    setLoadError('');
    fetchHandoverTargets(accessToken)
      .then(setTargets)
      .catch((error: unknown) => {
        setTargets([]);
        const detail = error instanceof Error ? error.message : '';
        setLoadError(detail ? `Не удалось загрузить список: ${detail}` : 'Не удалось загрузить список получателей');
      });
  }, [accessToken]);

  useEffect(() => { loadTargets(); }, [loadTargets]);

  async function submit() {
    const counted = Number(countedCash);
    if (!toStaffId) { setMessage('Выберите, кому передаёте кассу'); return; }
    if (!Number.isInteger(counted) || counted < 0) { setMessage('Пересчёт наличных — целое число ≥ 0'); return; }
    setBusy(true);
    setMessage('');
    try {
      await handoverShift(shiftId, { toStaffId, countedCash: counted, reason: reason.trim() || undefined }, accessToken, crypto.randomUUID());
      setMessage('Смена передана.');
      setToStaffId('');
      setCountedCash('');
      setReason('');
      onDone();
    } catch {
      setMessage('Не удалось передать смену. Проверьте пересчёт и повторите.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'h-11 w-full rounded-[10px] border border-white/10 bg-white/[.05] px-3 text-sm text-white outline-none focus:border-white/25';

  if (loadError) {
    return (
      <div className="rounded-[14px] border border-white/10 bg-white/[.03] p-4">
        <p className="text-sm text-white/70">{loadError}</p>
        <button
          type="button"
          onClick={loadTargets}
          className="mt-3 rounded-[10px] border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-white/30"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (targets.length === 0) {
    return (
      <div className="rounded-[14px] border border-white/10 bg-white/[.03] p-4 text-sm text-white/55">
        Передать смену некому: на вашей точке нет других активных сотрудников.
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-white/10 bg-white/[.03] p-4">
      <div className="mb-3 text-sm font-semibold text-white">Передать смену</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Кому передать смену" value={toStaffId} onChange={(e) => setToStaffId(e.target.value)} className={inputClass}>
          <option value="">Получатель…</option>
          {targets.map((target) => <option key={target.id} value={target.id}>{target.username} · {target.role}</option>)}
        </select>
        <input aria-label="Пересчёт наличных" inputMode="numeric" placeholder="Пересчёт наличных, сом" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} className={inputClass} />
        <input aria-label="Причина расхождения" placeholder="Причина (если расхождение)" value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} sm:col-span-2`} />
      </div>
      <button type="button" disabled={busy} onClick={() => void submit()} className="mt-3 w-full rounded-[10px] bg-lime py-3 text-sm font-extrabold text-lime-ink disabled:opacity-50">
        {busy ? 'Передаём…' : 'Передать кассу'}
      </button>
      {message && <p className="mt-2 text-sm text-white/70">{message}</p>}
    </div>
  );
}
