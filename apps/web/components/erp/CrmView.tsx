'use client';

import { useCallback, useEffect, useState } from 'react';
import { escalateTicket, fetchTickets, transitionTicket, type Ticket } from '@/lib/crm';
import { CustomerCard } from './CustomerCard';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { clearStaffSession, loadStaffSession, type StaffSession } from '@/lib/staff-session';

const PRIORITY_COLOR: Record<string, string> = { urgent: '#FF5B2E', high: '#E5B23C', normal: '#8A7F76' };
const STATUS_RU: Record<string, string> = {
  new: 'Новый', in_progress: 'В работе', waiting: 'Ждём клиента', resolved: 'Решён', closed: 'Закрыт',
};
const CHANNEL_ICON: Record<string, string> = {
  web: '🌐', app: '📱', whatsapp: '🟢', telegram: '✈️', call: '📞', store: '🏬',
};
// next-status options per current status (mirror of the server ticket-state machine)
const NEXT: Record<string, string[]> = {
  new: ['in_progress', 'closed'],
  in_progress: ['waiting', 'resolved'],
  waiting: ['in_progress', 'resolved'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};
const FILTERS = ['all', 'new', 'in_progress', 'waiting', 'resolved'] as const;

/** Support Inbox + Customer 360 — the CRM cockpit surface of ERP 2.0. */
export function CrmView() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setTickets(null);
    fetchTickets(filter === 'all' ? undefined : filter, session.accessToken)
      .then(setTickets)
      .catch(() => setTickets([]));
  }, [filter, session]);

  useEffect(() => {
    setSession(loadStaffSession());
    setHydrated(true);
  }, []);

  useEffect(() => { if (session) load(); }, [load, session]);

  async function act(t: Ticket, fn: () => Promise<Ticket>) {
    setBusy(t.id);
    try {
      await fn();
      load();
    } catch {
      /* surfaced by the row staying put; keep the cockpit calm */
    } finally {
      setBusy(null);
    }
  }

  const overdue = (t: Ticket) => new Date(t.sla).getTime() < Date.now() && t.status !== 'closed' && t.status !== 'resolved';

  function logout() {
    clearStaffSession();
    setSession(null);
    setTickets(null);
    setSelected(null);
  }

  if (!hydrated) {
    return <p className="font-mono text-sm text-faint">Загрузка…</p>;
  }

  if (!session) {
    return (
      <div className="grid min-h-[420px] place-items-center">
        <StaffSessionLogin
          title="CRM · вход"
          caption="Нужна роль администратора или владельца."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-subtle">
          <span>{session.username} · {session.role}</span>
          <button
            type="button"
            onClick={logout}
            className="rounded-chip border border-surface-3 px-3 py-1.5 font-semibold text-muted hover:text-white"
          >
            Выйти staff
          </button>
        </div>

        {/* filter chips */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-chip px-3 py-1.5 text-[12px] font-semibold transition ${
                filter === f ? 'bg-coral text-white' : 'bg-surface-2 text-muted hover:text-white'
              }`}
            >
              {f === 'all' ? 'Все' : STATUS_RU[f]}
            </button>
          ))}
        </div>

        {tickets === null && <p className="font-mono text-sm text-faint">Загрузка…</p>}
        {tickets?.length === 0 && (
          <div className="rounded-[16px] border border-dashed border-surface-3 bg-surface px-5 py-14 text-center">
            <p className="font-display font-bold">Инбокс пуст</p>
            <p className="mt-1 text-sm text-subtle">Нет обращений в этом статусе.</p>
          </div>
        )}

        <ul className="flex flex-col gap-2.5">
          {tickets?.map((t) => (
            <li
              key={t.id}
              className={`rounded-[14px] border bg-surface p-4 transition ${
                selected?.id === t.id ? 'border-coral' : 'border-surface-3 hover:border-[#3A332B]'
              }`}
            >
              <button type="button" onClick={() => setSelected(t)} className="block w-full text-left">
                <div className="flex items-center gap-2">
                  <span>{CHANNEL_ICON[t.channel] ?? '•'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.subject}</span>
                  <span
                    className="rounded-chip px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: '#221E19', color: PRIORITY_COLOR[t.priority] }}
                  >
                    {t.priority}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-subtle">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-bright">{STATUS_RU[t.status]}</span>
                  {t.assignee && <span>· {t.assignee}</span>}
                  {overdue(t) && <span className="font-bold text-coral">● SLA просрочен</span>}
                  <span className="ml-auto font-mono">{t.channel}</span>
                </div>
              </button>

              {(NEXT[t.status]?.length > 0 || (t.status !== 'closed' && t.status !== 'resolved')) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {NEXT[t.status]?.map((to) => (
                    <button
                      key={to}
                      type="button"
                      disabled={busy === t.id}
                      onClick={() => act(t, () => transitionTicket(t.id, to, session.accessToken))}
                      className="rounded-btn bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-bright transition hover:bg-[#2A241F] disabled:opacity-40"
                    >
                      → {STATUS_RU[to]}
                    </button>
                  ))}
                  {t.status !== 'closed' && t.status !== 'resolved' && t.priority !== 'urgent' && (
                    <button
                      type="button"
                      disabled={busy === t.id}
                      onClick={() => act(t, () => escalateTicket(t.id, session.accessToken))}
                      className="rounded-btn bg-[#3A2016] px-2.5 py-1 text-[11px] font-semibold text-danger-soft transition hover:bg-[#4A281C] disabled:opacity-40"
                    >
                      ↑ Эскалировать
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Customer 360 panel */}
      <div>
        {selected ? (
          <CustomerCard customerId={selected.customerId} accessToken={session.accessToken} />
        ) : (
          <div className="rounded-[16px] border border-dashed border-surface-3 bg-surface px-5 py-14 text-center text-sm text-subtle">
            Выберите обращение — откроется карточка клиента (Customer 360).
          </div>
        )}
      </div>
    </div>
  );
}
