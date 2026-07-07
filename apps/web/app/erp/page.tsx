'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  fetchDashboard,
  fetchKpi,
  fetchLedger,
  fetchRevenue,
  fetchRisks,
  type Dashboard,
  type Kpi,
  type LedgerEvent,
  type RiskSignal,
} from '@/lib/reports';
import { som } from '@/lib/format';
import { CrmView } from '@/components/erp/CrmView';

type Route = 'dash' | 'finance' | 'stock' | 'kpi' | 'crm' | 'risks' | 'ledger';

const NAV: { id: Route; icon: string; label: string }[] = [
  { id: 'dash', icon: '▦', label: 'Дашборд' },
  { id: 'finance', icon: '💰', label: 'Финансы' },
  { id: 'kpi', icon: '📈', label: 'Маржа · KPI' },
  { id: 'stock', icon: '📦', label: 'Склад' },
  { id: 'crm', icon: '💬', label: 'CRM · Инбокс' },
  { id: 'risks', icon: '⚠', label: 'Риски' },
  { id: 'ledger', icon: '📜', label: 'Event Ledger' },
];
const TITLES: Record<Route, [string, string]> = {
  dash: ['Дашборд', 'Обзор · всё из Event Ledger'],
  finance: ['Финансы', 'Деньги · P&L'],
  kpi: ['Маржа · KPI', 'Валовая маржа, средний чек, топ-товары'],
  stock: ['Склад', 'Остатки по статусам'],
  crm: ['CRM · Поддержка', 'Инбокс обращений + Customer 360'],
  risks: ['Риски', 'Центр тревог'],
  ledger: ['Event Ledger', 'Единая книга событий'],
};

/** Command Center: turn a risk signal into a jump to the screen that resolves it. */
const SIGNAL_ACTION: Record<string, { tab?: Route; href?: string }> = {
  pending_approval: { href: '/approvals' },
  cash_discrepancy: { tab: 'finance' },
  cod_outstanding: { tab: 'finance' },
  stale_reservations: { tab: 'stock' },
  warranty_sla_breach: { href: '/warranty' },
  rma_sla_breach: { href: '/warehouse' },
  ticket_sla_breach: { tab: 'crm' },
  debt_overdue: { tab: 'crm' },
};
const STATUS_RU: Record<string, string> = {
  created: 'Оформлен', reserved: 'Зарезервирован', paid: 'Оплачен', completed: 'Завершён',
  cancelled: 'Отменён', refunded: 'Возврат', exchanged: 'Обмен', in_stock: 'В наличии',
  sold: 'Продан', written_off: 'Списан', returned: 'Возвращён', in_repair: 'В ремонте',
};
const ru = (s: string) => STATUS_RU[s] ?? s;
const SEV_COLOR: Record<string, string> = { high: '#FF8A7A', medium: '#E5B23C', low: '#8A7F76' };

export default function ErpPage() {
  const router = useRouter();
  const [route, setRoute] = useState<Route>('dash');
  const [d, setD] = useState<Dashboard | null>(null);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [risks, setRisks] = useState<RiskSignal[]>([]);
  const [ledger, setLedger] = useState<LedgerEvent[]>([]);
  const [period, setPeriod] = useState(7);
  const [revenue, setRevenue] = useState<{ day: string; amount: number }[]>([]);

  useEffect(() => {
    fetchDashboard().then(setD).catch(() => setD(null));
    fetchKpi().then(setKpi).catch(() => setKpi(null));
    fetchRisks().then((r) => setRisks(r.signals)).catch(() => setRisks([]));
    fetchLedger().then(setLedger).catch(() => setLedger([]));
  }, []);

  useEffect(() => {
    fetchRevenue(period).then(setRevenue).catch(() => setRevenue([]));
  }, [period]);

  /** Command Center: jump from a risk signal to the screen that resolves it. */
  function actOnSignal(kind: string) {
    const a = SIGNAL_ACTION[kind];
    if (a?.href) router.push(a.href);
    else if (a?.tab) setRoute(a.tab);
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-[#0E0C0A] font-sans text-white">
      {/* SIDEBAR */}
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-[#2E2822] bg-[#1A1611] p-3">
        <div className="flex items-center gap-2.5 px-2 pb-4">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-coral font-display text-base font-extrabold text-white">A</span>
          <div>
            <div className="font-display text-sm font-extrabold">AliStore ERP</div>
            <div className="text-[10px] text-[#8A7F76]">Владелец</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setRoute(m.id)}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] transition ${
                route === m.id ? 'bg-[#221E19] font-bold text-white' : 'font-medium text-[#A79C92] hover:text-white'
              }`}
            >
              <span className="text-base">{m.icon}</span>
              <span>{m.label}</span>
              {m.id === 'risks' && risks.length > 0 && (
                <span className="ml-auto rounded-chip bg-coral px-1.5 text-[10px] font-bold text-white">{risks.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3">
          <div className="text-[11px] text-[#8A7F76]">Сеть</div>
          <div className="mt-0.5 text-[13px] font-semibold">
            {d ? `${d.ops.openShifts} смен · онлайн` : '…'}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center border-b border-[#2E2822] bg-[#16130F] px-7 py-4">
          <div>
            <div className="font-display text-xl font-bold">{TITLES[route][0]}</div>
            <div className="text-xs text-[#8A7F76]">{TITLES[route][1]}</div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/" className="rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white">
              ⌂ Выйти
            </Link>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#2A241F] text-sm">В</span>
          </div>
        </div>

        <div className="p-7">
          {route === 'dash' && (
            <DashboardView d={d} risks={risks} revenue={revenue} period={period} onPeriod={setPeriod} onSignal={actOnSignal} />
          )}
          {route === 'finance' && <FinanceView d={d} />}
          {route === 'kpi' && <KpiView kpi={kpi} />}
          {route === 'stock' && <StockView d={d} />}
          {route === 'crm' && <CrmView />}
          {route === 'risks' && <RisksView risks={risks} onSignal={actOnSignal} />}
          {route === 'ledger' && <LedgerView ledger={ledger} />}
        </div>
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">{children}</div>;
}

function Kpi({ label, value, color = '#fff' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-4.5" style={{ padding: 18 }}>
      <div className="text-xs text-[#8A7F76]">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-extrabold tabular" style={{ color }}>{value}</div>
    </div>
  );
}

function DashboardView({
  d, risks, revenue, period, onPeriod, onSignal,
}: {
  d: Dashboard | null;
  risks: RiskSignal[];
  revenue: { day: string; amount: number }[];
  period: number;
  onPeriod: (days: number) => void;
  onSignal: (kind: string) => void;
}) {
  const data = revenue.length ? revenue : (d?.revenue7d ?? []);
  const max = Math.max(1, ...data.map((r) => r.amount));
  const total = data.reduce((s, b) => s + b.amount, 0);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi label="Продажи" value={d ? som(d.money.salesGross) : '…'} />
        <Kpi label="Чистыми" value={d ? som(d.money.net) : '…'} color="#C6FF3D" />
        <Kpi label="Заказов" value={d ? String(d.orders.total) : '…'} />
        <Kpi label="На одобрении" value={d ? String(d.ops.pendingApprovals) : '…'} color={d && d.ops.pendingApprovals > 0 ? '#E5B23C' : '#fff'} />
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <span className="font-display text-[15px] font-bold">Выручка · {som(total)}</span>
            <div className="ml-auto flex gap-1">
              {[7, 30].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPeriod(p)}
                  className={`rounded-chip px-2.5 py-1 text-[11px] font-semibold transition ${
                    period === p ? 'bg-lime text-lime-ink' : 'bg-[#221E19] text-[#A79C92] hover:text-white'
                  }`}
                >
                  {p} дн
                </button>
              ))}
            </div>
          </div>
          <div className="flex h-40 items-end gap-1">
            {data.map((b, i) => (
              <div key={b.day} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t-sm bg-gradient-to-b from-[#C6FF3D] to-[#8FD40F]"
                  style={{ height: `${Math.max(3, (b.amount / max) * 150)}px` }}
                  title={`${b.day}: ${som(b.amount)}`}
                />
                <span className="text-[9px] text-[#8A7F76]">
                  {period <= 7
                    ? new Date(b.day).toLocaleDateString('ru-RU', { weekday: 'short' })
                    : i % 5 === 0 ? b.day.slice(8) : ''}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="mb-3.5 font-display text-[15px] font-bold">Требуют решения</div>
          {risks.length === 0 && <p className="text-sm text-[#8A7F76]">✓ Тревог нет</p>}
          {risks.slice(0, 5).map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSignal(r.kind)}
              className="mb-3 block w-full border-l-[3px] pl-3 text-left transition hover:opacity-80"
              style={{ borderColor: SEV_COLOR[r.severity] }}
            >
              <div className="text-[13px] leading-snug text-white">{r.detail}</div>
              <div className="mt-0.5 font-mono text-[11px]" style={{ color: SEV_COLOR[r.severity] }}>{r.severity} · перейти →</div>
            </button>
          ))}
        </Card>
      </div>
    </>
  );
}

function FinanceView({ d }: { d: Dashboard | null }) {
  const rows = d
    ? [
        { label: 'Выручка', value: som(d.money.salesGross), color: '#fff' },
        { label: 'Возвраты', value: `−${som(d.money.refunds)}`, color: '#FF8A7A' },
        { label: 'Чистыми', value: som(d.money.net), color: '#C6FF3D' },
      ]
    : [];
  return (
    <Card>
      <div className="mb-4 font-display text-[15px] font-bold">P&L</div>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between border-b border-[#221E19] py-2.5 text-[13px]">
          <span style={{ color: r.color }}>{r.label}</span>
          <span className="font-mono tabular" style={{ color: r.color }}>{r.value}</span>
        </div>
      ))}
      <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-[#8A7F76]">По способам</div>
      {(d?.money.byMethod ?? []).map((m) => (
        <div key={m.method} className="flex justify-between py-1 text-[13px] text-[#D8CFC6]">
          <span>{m.method}</span>
          <span className="font-mono tabular">{som(m.amount)}</span>
        </div>
      ))}
    </Card>
  );
}

function StockView({ d }: { d: Dashboard | null }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <Card>
        <div className="mb-3.5 font-display text-[15px] font-bold">Склад по статусам</div>
        {(d?.stock.byStatus ?? []).map((s) => (
          <div key={s.status} className="flex justify-between border-b border-[#221E19] py-2 text-[13px]">
            <span className="text-[#D8CFC6]">{ru(s.status)}</span>
            <span className="font-mono tabular">{s.count}</span>
          </div>
        ))}
      </Card>
      <Card>
        <div className="mb-3.5 font-display text-[15px] font-bold">Заказы по статусам</div>
        {(d?.orders.byStatus ?? []).map((s) => (
          <div key={s.status} className="flex justify-between border-b border-[#221E19] py-2 text-[13px]">
            <span className="text-[#D8CFC6]">{ru(s.status)}</span>
            <span className="font-mono tabular">{s.count}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function RisksView({ risks, onSignal }: { risks: RiskSignal[]; onSignal: (kind: string) => void }) {
  return (
    <Card>
      {risks.length === 0 && <p className="text-sm text-[#8A7F76]">✓ Тревог нет — всё сходится.</p>}
      <ul className="flex flex-col gap-2">
        {risks.map((r, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onSignal(r.kind)}
              className="flex w-full items-center gap-3 rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2.5 text-left text-sm transition hover:border-[#3A342E]"
            >
              <span className="font-mono text-[10px] font-bold uppercase" style={{ color: SEV_COLOR[r.severity] }}>{r.severity}</span>
              <span className="text-[#D8CFC6]">{r.detail}</span>
              <span className="ml-auto text-[#6E645C]">→</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function KpiView({ kpi }: { kpi: Kpi | null }) {
  if (!kpi) return <p className="font-mono text-sm text-[#6E645C]">Загрузка…</p>;
  const maxRev = Math.max(1, ...kpi.topProducts.map((p) => p.revenue));
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi label="Валовая маржа" value={som(kpi.grossMargin)} color="#C6FF3D" />
        <Kpi label="Маржа %" value={`${kpi.marginPct}%`} color={kpi.marginPct < 10 ? '#E5B23C' : '#C6FF3D'} />
        <Kpi label="Средний чек" value={som(kpi.avgCheck)} />
        <Kpi label="Себестоимость" value={som(kpi.cogs)} color="#FF8A7A" />
      </div>
      <Card>
        <div className="mb-4 flex items-center">
          <span className="font-display text-[15px] font-bold">Топ товары по выручке</span>
          <span className="ml-auto text-xs text-[#8A7F76]">выручка · {kpi.paidOrders} оплаченных заказов</span>
        </div>
        {kpi.topProducts.length === 0 && <p className="text-sm text-[#8A7F76]">Пока нет продаж.</p>}
        {kpi.topProducts.map((p) => (
          <div key={p.sku} className="mb-3">
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="text-[#D8CFC6]">{p.name}</span>
              <span className="font-mono tabular text-white">{som(p.revenue)} · {p.units} шт</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#221E19]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#C6FF3D] to-[#8FD40F]" style={{ width: `${(p.revenue / maxRev) * 100}%` }} />
            </div>
          </div>
        ))}
      </Card>

      <div className="mt-3.5">
        <Card>
          <div className="mb-3.5 font-display text-[15px] font-bold">KPI продавцов</div>
          {kpi.sellers.length === 0 && <p className="text-sm text-[#8A7F76]">Нет продаж по сменам.</p>}
          {kpi.sellers.map((s, i) => (
            <div key={s.staffId} className="flex items-center gap-3 border-b border-[#221E19] py-2.5 text-[13px] last:border-0">
              <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-[#2A241F] font-mono text-[11px] text-[#8A7F76]">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[#D8CFC6]">{s.staffId}</span>
              <span className="text-[#8A7F76]">{s.sales} продаж</span>
              <span className="font-mono tabular font-semibold text-white">{som(s.revenue)}</span>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

function LedgerView({ ledger }: { ledger: LedgerEvent[] }) {
  return (
    <Card>
      <ul className="flex flex-col gap-2">
        {ledger.slice(0, 50).map((e) => (
          <li key={e.id} className="flex items-center gap-2 border-b border-[#221E19] pb-2 text-xs">
            <span className="rounded bg-[#221E19] px-1.5 py-0.5 font-mono text-[11px] text-[#C6FF3D]">{e.type}</span>
            <span className="text-[#8A7F76]">{e.actor}</span>
            <span className="ml-auto font-mono text-[10px] text-[#6E645C]">{e.ts.slice(11, 19)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
