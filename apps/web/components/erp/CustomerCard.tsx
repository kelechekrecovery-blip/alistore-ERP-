'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchCustomerOverview, setConsent, type CustomerOverview } from '@/lib/crm';
import { som } from '@/lib/format';

const PRIORITY_COLOR: Record<string, string> = { urgent: '#FF5B2E', high: '#E5B23C', normal: '#8A7F76' };

/** Customer 360 — folds orders, spend, debts, warranties and tickets for one customer. */
export function CustomerCard({ customerId, accessToken }: { customerId: string; accessToken: string }) {
  const [ov, setOv] = useState<CustomerOverview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchCustomerOverview(customerId, accessToken).then(setOv).catch(() => setOv(null));
  }, [customerId, accessToken]);

  useEffect(() => {
    setOv(null);
    load();
  }, [load]);

  async function toggleConsent() {
    if (!ov) return;
    setBusy(true);
    try {
      await setConsent(customerId, !ov.customer.consent, accessToken);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!ov) return <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5 text-sm text-[#8A7F76]">Загрузка клиента…</div>;

  const c = ov.customer;
  return (
    <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-[#2A241F] font-display text-lg font-bold">
          {c.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <div className="font-display text-[17px] font-bold">{c.name}</div>
          <div className="font-mono text-xs text-[#8A7F76]">{c.phone}</div>
        </div>
        <button
          type="button"
          onClick={toggleConsent}
          disabled={busy}
          className={`ml-auto rounded-chip px-3 py-1.5 text-[11px] font-bold transition ${
            c.consent ? 'bg-[#1E3A1E] text-[#C6FF3D]' : 'bg-[#221E19] text-[#8A7F76] hover:text-white'
          }`}
          title="Согласие на маркетинг"
        >
          {c.consent ? '✓ Согласие' : '✕ Без согласия'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <Stat label="Потрачено" value={som(ov.orders.spent)} color="#C6FF3D" />
        <Stat label="Заказов" value={String(ov.orders.total)} />
        <Stat label="Долг" value={som(ov.debts.openBalance)} color={ov.debts.openBalance > 0 ? '#FF8A7A' : '#fff'} />
      </div>

      <Section title="Гарантии" count={ov.warranties.open}>
        {ov.warranties.items.length === 0 && <Empty />}
        {ov.warranties.items.map((w) => (
          <Row key={w.id} left={<span className="font-mono text-xs">{w.imei}</span>} right={w.status} />
        ))}
      </Section>

      <Section title="Обращения" count={ov.tickets.open}>
        {ov.tickets.items.length === 0 && <Empty />}
        {ov.tickets.items.map((t) => (
          <Row
            key={t.id}
            left={<span className="truncate">{t.subject}</span>}
            right={t.status}
            dot={PRIORITY_COLOR[t.priority]}
          />
        ))}
      </Section>

      <Section title="Долги" count={ov.debts.count}>
        {ov.debts.items.length === 0 && <Empty />}
        {ov.debts.items.map((d) => (
          <Row key={d.id} left={<span>{som(d.balance)} остаток</span>} right={d.status} />
        ))}
      </Section>

      <Section title="Заказы" count={ov.orders.total}>
        {ov.orders.recent.length === 0 && <Empty />}
        {ov.orders.recent.map((o) => (
          <Row key={o.id} left={<span className="font-mono text-xs">#{o.id.slice(-6)}</span>} right={som(o.total)} />
        ))}
      </Section>
    </div>
  );
}

function Stat({ label, value, color = '#fff' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3">
      <div className="text-[10px] text-[#8A7F76]">{label}</div>
      <div className="mt-1 font-display text-base font-extrabold tabular" style={{ color }}>{value}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#8A7F76]">
        {title}
        {count > 0 && <span className="rounded-chip bg-[#221E19] px-1.5 text-[10px] text-[#D8CFC6]">{count}</span>}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({ left, right, dot }: { left: React.ReactNode; right: string; dot?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[#221E19] py-1.5 text-[13px] text-[#D8CFC6]">
      {dot && <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="min-w-0 flex-1 truncate">{left}</span>
      <span className="font-mono text-xs text-[#8A7F76]">{right}</span>
    </div>
  );
}

function Empty() {
  return <div className="py-1.5 text-xs text-[#6E645C]">—</div>;
}
