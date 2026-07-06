'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  fetchDashboard,
  fetchLedger,
  fetchRisks,
  type Dashboard,
  type LedgerEvent,
  type RiskSignal,
} from '@/lib/reports';
import { som } from '@/lib/format';

const STATUS_RU: Record<string, string> = {
  created: 'Оформлен', reserved: 'Зарезервирован', paid: 'Оплачен', completed: 'Завершён',
  cancelled: 'Отменён', refunded: 'Возврат', in_stock: 'В наличии', sold: 'Продан',
  written_off: 'Списан', in_repair: 'В ремонте', returned: 'Возвращён',
};
const ru = (s: string) => STATUS_RU[s] ?? s;

const SEV: Record<string, string> = {
  high: 'border-danger/30 bg-danger/5 text-danger',
  medium: 'border-warn/40 bg-warn/10 text-[#8a6d1f]',
  low: 'border-ink/15 bg-white text-ink/60',
};

export default function ErpPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [risks, setRisks] = useState<RiskSignal[] | null>(null);
  const [ledger, setLedger] = useState<LedgerEvent[] | null>(null);

  useEffect(() => {
    fetchDashboard().then(setD).catch(() => setD(null));
    fetchRisks().then((r) => setRisks(r.signals)).catch(() => setRisks([]));
    fetchLedger().then(setLedger).catch(() => setLedger([]));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-sand bg-grain">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-ink/10 bg-white/80 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-ink font-display text-lg font-extrabold text-sand">
          E
        </span>
        <div>
          <div className="font-display text-lg font-bold text-ink">ERP · Кабинет владельца</div>
          <div className="text-xs text-ink/50">Всё из Event Ledger · цифры не расходятся</div>
        </div>
        <Link href="/" className="ml-auto rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30">
          ⌂ Выйти
        </Link>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Продажи" value={d ? som(d.money.salesGross) : '…'} accent="text-ink" />
          <Kpi label="Возвраты" value={d ? som(d.money.refunds) : '…'} accent="text-danger" />
          <Kpi label="Чистыми" value={d ? som(d.money.net) : '…'} accent="text-success" big />
          <Kpi label="Заказов" value={d ? String(d.orders.total) : '…'} accent="text-ink" />
          <Kpi label="Смен открыто" value={d ? String(d.ops.openShifts) : '…'} accent="text-ink" />
          <Kpi label="На одобрении" value={d ? String(d.ops.pendingApprovals) : '…'} accent={d && d.ops.pendingApprovals > 0 ? 'text-warn' : 'text-ink/40'} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            {/* Risk Center */}
            <Panel title="Risk Center" badge={risks?.length}>
              {risks === null && <p className="font-mono text-sm text-ink/40">Загрузка…</p>}
              {risks && risks.length === 0 && (
                <p className="rounded-btn bg-success/10 px-3 py-3 text-sm text-success">
                  ✓ Тревог нет — всё сходится.
                </p>
              )}
              {risks && risks.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {risks.map((r, i) => (
                    <li key={i} className={`flex items-center gap-3 rounded-btn border px-3 py-2.5 text-sm ${SEV[r.severity]}`}>
                      <span className="font-mono text-[10px] font-bold uppercase">{r.severity}</span>
                      <span>{r.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* breakdowns */}
            <div className="grid gap-6 sm:grid-cols-2">
              <Panel title="Заказы по статусам">
                <Bars items={d?.orders.byStatus.map((s) => ({ label: ru(s.status), n: s.count })) ?? []} />
              </Panel>
              <Panel title="Склад по статусам">
                <Bars items={d?.stock.byStatus.map((s) => ({ label: ru(s.status), n: s.count })) ?? []} />
              </Panel>
            </div>

            <Panel title="Оплаты по способам">
              <ul className="flex flex-col gap-1.5">
                {(d?.money.byMethod ?? []).map((m) => (
                  <li key={m.method} className="flex justify-between text-sm">
                    <span className="text-ink/60">{m.method}</span>
                    <span className="font-mono tabular text-ink">{som(m.amount)}</span>
                  </li>
                ))}
                {d && d.money.byMethod.length === 0 && <p className="text-sm text-ink/40">Нет данных</p>}
              </ul>
            </Panel>
          </div>

          {/* Event Ledger feed */}
          <Panel title="Event Ledger">
            {ledger === null && <p className="font-mono text-sm text-ink/40">Загрузка…</p>}
            <ul className="flex flex-col gap-2">
              {(ledger ?? []).slice(0, 30).map((e) => (
                <li key={e.id} className="flex items-center gap-2 border-b border-ink/5 pb-2 text-xs">
                  <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[11px] text-ink/70">{e.type}</span>
                  <span className="text-ink/45">{e.actor}</span>
                  <span className="ml-auto font-mono text-[10px] text-ink/35">{e.ts.slice(11, 19)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, big }: { label: string; value: string; accent: string; big?: boolean }) {
  return (
    <div className={`rounded-card border border-ink/10 bg-white p-4 shadow-soft ${big ? 'ring-1 ring-success/20' : ''}`}>
      <p className="text-xs font-medium text-ink/50">{label}</p>
      <p className={`mt-1 font-display text-xl font-extrabold tabular ${accent}`}>{value}</p>
    </div>
  );
}

function Panel({ title, badge, children }: { title: string; badge?: number; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-ink/10 bg-white p-5 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
        {typeof badge === 'number' && badge > 0 && (
          <span className="rounded-chip bg-danger/10 px-2 py-0.5 font-mono text-xs font-bold text-danger">{badge}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function Bars({ items }: { items: { label: string; n: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  if (items.length === 0) return <p className="text-sm text-ink/40">Нет данных</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-ink/60">{i.label}</span>
          <span className="h-2 rounded-chip bg-coral/70" style={{ width: `${(i.n / max) * 100}%`, minWidth: '6px' }} />
          <span className="ml-auto font-mono tabular text-ink">{i.n}</span>
        </li>
      ))}
    </ul>
  );
}
