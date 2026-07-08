'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  fetchDashboard,
  fetchInsights,
  fetchKpi,
  fetchLedger,
  fetchRevenue,
  fetchRevenueTrend,
  fetchRisks,
  type Dashboard,
  type Insight,
  type Kpi,
  type LedgerEvent,
  type RevenueTrend,
  type RiskSignal,
} from '@/lib/reports';
import {
  fetchExternalReadiness,
  type ExternalReadinessReport,
} from '@/lib/api';
import { som } from '@/lib/format';
import { CrmView } from '@/components/erp/CrmView';
import { AiView } from '@/components/erp/AiView';
import { PricingView } from '@/components/erp/PricingView';
import { ReorderView } from '@/components/erp/ReorderView';
import { KpiView } from '@/components/erp/KpiView';
import { DashboardView } from '@/components/erp/DashboardView';
import { CampaignsView } from '@/components/erp/CampaignsView';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { clearStaffSession, loadStaffSession, type StaffSession } from '@/lib/staff-session';

type Route = 'dash' | 'ai' | 'pricing' | 'reorder' | 'finance' | 'stock' | 'kpi' | 'crm' | 'campaigns' | 'risks' | 'readiness' | 'ledger';

const NAV: { id: Route; icon: string; label: string }[] = [
  { id: 'dash', icon: '▦', label: 'Дашборд' },
  { id: 'ai', icon: '🧠', label: 'Ассистент' },
  { id: 'pricing', icon: '🏷️', label: 'Цены' },
  { id: 'reorder', icon: '🛒', label: 'Закупки' },
  { id: 'finance', icon: '💰', label: 'Финансы' },
  { id: 'kpi', icon: '📈', label: 'Маржа · KPI' },
  { id: 'stock', icon: '📦', label: 'Склад' },
  { id: 'crm', icon: '💬', label: 'CRM · Инбокс' },
  { id: 'campaigns', icon: '◌', label: 'Кампании' },
  { id: 'risks', icon: '⚠', label: 'Риски' },
  { id: 'readiness', icon: '✓', label: 'Готовность' },
  { id: 'ledger', icon: '📜', label: 'Event Ledger' },
];
const TITLES: Record<Route, [string, string]> = {
  dash: ['Дашборд', 'Обзор · всё из Event Ledger'],
  ai: ['AI-ассистент', 'Инсайты владельца из Event Ledger'],
  pricing: ['Ценовые рекомендации', 'Спрос/остаток → подсказка по цене'],
  reorder: ['Закупки', 'Что дозаказать по спросу/остатку'],
  finance: ['Финансы', 'Деньги · P&L'],
  kpi: ['Маржа · KPI', 'Валовая маржа, средний чек, топ-товары'],
  stock: ['Склад', 'Остатки по статусам'],
  crm: ['CRM · Поддержка', 'Инбокс обращений + Customer 360'],
  campaigns: ['Кампании', 'Сегменты, consent-фильтр и ROI'],
  risks: ['Риски', 'Центр тревог'],
  readiness: ['Готовность запуска', 'Внешние провайдеры · железо · production gate'],
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
  margin_leak: { tab: 'kpi' },
  stock_money_mismatch: { tab: 'stock' },
  imei_reuse: { href: '/warehouse' },
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
  const [trend, setTrend] = useState<RevenueTrend | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [readiness, setReadiness] = useState<ExternalReadinessReport | null>(null);
  const [readinessError, setReadinessError] = useState('');

  useEffect(() => {
    setSession(loadStaffSession());
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchDashboard(session.accessToken).then(setD).catch(() => setD(null));
    fetchKpi(session.accessToken).then(setKpi).catch(() => setKpi(null));
    fetchRisks(session.accessToken).then((r) => setRisks(r.signals)).catch(() => setRisks([]));
    fetchLedger(session.accessToken).then(setLedger).catch(() => setLedger([]));
    fetchInsights(session.accessToken).then((r) => setInsights(r.insights)).catch(() => setInsights([]));
    fetchExternalReadiness()
      .then((report) => {
        setReadiness(report);
        setReadinessError('');
      })
      .catch(() => {
        setReadiness(null);
        setReadinessError('Не удалось загрузить readiness report');
      });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    fetchRevenue(period, session.accessToken).then(setRevenue).catch(() => setRevenue([]));
    fetchRevenueTrend(period, session.accessToken).then(setTrend).catch(() => setTrend(null));
  }, [period, session]);

  /** Command Center: jump from a risk signal to the screen that resolves it. */
  function actOnSignal(kind: string) {
    const a = SIGNAL_ACTION[kind];
    if (a?.href) router.push(a.href);
    else if (a?.tab) setRoute(a.tab);
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E0C0A] p-4">
        <Link
          href="/"
          className="fixed right-4 top-4 z-[60] rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          ⌂ Выйти
        </Link>
        <StaffSessionLogin
          title="AliStore ERP · вход"
          caption="Войдите как admin или owner, чтобы открыть финансы, отчёты и AI."
          onAuthenticated={setSession}
        />
      </div>
    );
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
              {m.id === 'readiness' && readiness?.summary.blockingRemaining ? (
                <span className="ml-auto rounded-chip bg-coral px-1.5 text-[10px] font-bold text-white">{readiness.summary.blockingRemaining}</span>
              ) : null}
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
            <button
              type="button"
              onClick={() => {
                clearStaffSession();
                setSession(null);
              }}
              className="rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
            >
              Выйти staff
            </button>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#2A241F] text-sm">В</span>
          </div>
        </div>

        <div className="p-7">
          {route === 'dash' && (
            <DashboardView d={d} risks={risks} revenue={revenue} trend={trend} period={period} accessToken={session.accessToken} onPeriod={setPeriod} onSignal={actOnSignal} />
          )}
          {route === 'ai' && <AiView insights={insights} />}
          {route === 'pricing' && <PricingView accessToken={session.accessToken} />}
          {route === 'reorder' && <ReorderView accessToken={session.accessToken} />}
          {route === 'finance' && <FinanceView d={d} />}
          {route === 'kpi' && <KpiView kpi={kpi} accessToken={session.accessToken} />}
          {route === 'stock' && <StockView d={d} />}
          {route === 'crm' && <CrmView />}
          {route === 'campaigns' && <CampaignsView />}
          {route === 'risks' && <RisksView risks={risks} onSignal={actOnSignal} />}
          {route === 'readiness' && <ReadinessView report={readiness} error={readinessError} />}
          {route === 'ledger' && <LedgerView ledger={ledger} />}
        </div>
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">{children}</div>;
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

function ReadinessView({
  report,
  error,
}: {
  report: ExternalReadinessReport | null;
  error: string;
}) {
  if (error) {
    return (
      <Card>
        <div className="text-sm font-semibold text-coral">{error}</div>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <div className="text-sm text-[#8A7F76]">Загружаем readiness report…</div>
      </Card>
    );
  }

  const blocking = report.checks.filter((check) => check.blocking && check.status !== 'ready');
  const optional = report.checks.filter((check) => !check.blocking && check.status !== 'ready');
  const ready = report.checks.filter((check) => check.status === 'ready');

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-[#8A7F76]">Production readiness</div>
            <div className="mt-1 font-display text-2xl font-extrabold">
              {report.status === 'ready' ? 'Готово к запуску' : 'Нужны внешние доступы'}
            </div>
            <div className="mt-2 max-w-2xl text-sm text-[#A79C92]">
              Софт-MVP закрыт. Эта панель показывает только внешние credentials, callbacks и
              ручную сертификацию железа, без раскрытия секретов.
            </div>
          </div>
          <div className="grid min-w-[320px] grid-cols-4 gap-2 text-center">
            <ReadinessMetric label="Ready" value={report.summary.ready} tone="good" />
            <ReadinessMetric label="Missing" value={report.summary.missing} tone="bad" />
            <ReadinessMetric label="Manual" value={report.summary.manualRequired} tone="warn" />
            <ReadinessMetric label="Optional" value={report.summary.optional} tone="muted" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#8A7F76]">
          <span className="rounded-chip bg-[#221E19] px-2.5 py-1">
            blocking: {report.summary.blockingRemaining}
          </span>
          <span className="rounded-chip bg-[#221E19] px-2.5 py-1">
            generated: {new Date(report.generatedAt).toLocaleString('ru-RU')}
          </span>
          <span className="rounded-chip bg-[#221E19] px-2.5 py-1">
            strict gate: npm run mvp:verify -- --strict-external
          </span>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <div className="font-display text-[15px] font-bold">Что блокирует production</div>
            <span className="rounded-chip bg-coral px-2.5 py-1 text-xs font-bold text-white">
              {blocking.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {blocking.map((check) => (
              <ReadinessRow key={check.id} check={check} />
            ))}
            {blocking.length === 0 && (
              <div className="rounded-[10px] border border-[#2E2822] bg-[#221E19] p-3 text-sm text-lime">
                Все blocking-проверки закрыты.
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="mb-3.5 font-display text-[15px] font-bold">Optional перед launch</div>
            <div className="space-y-2.5">
              {optional.map((check) => (
                <ReadinessRow key={check.id} check={check} compact />
              ))}
              {optional.length === 0 && (
                <div className="text-sm text-[#8A7F76]">Optional-пунктов без настройки нет.</div>
              )}
            </div>
          </Card>
          <Card>
            <div className="mb-3.5 font-display text-[15px] font-bold">Уже готово</div>
            <div className="flex flex-wrap gap-2">
              {ready.map((check) => (
                <span
                  key={check.id}
                  className="rounded-chip border border-lime/30 bg-[#18210F] px-2.5 py-1 text-xs font-semibold text-lime"
                >
                  {check.title}
                </span>
              ))}
              {ready.length === 0 && (
                <span className="text-sm text-[#8A7F76]">Внешние пункты пока не закрыты.</span>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ReadinessMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'bad' | 'warn' | 'muted';
}) {
  const color = {
    good: 'text-lime',
    bad: 'text-coral',
    warn: 'text-[#E5B23C]',
    muted: 'text-[#A79C92]',
  }[tone];
  return (
    <div className="rounded-[10px] border border-[#2E2822] bg-[#221E19] p-3">
      <div className={`font-display text-xl font-extrabold ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-[#8A7F76]">{label}</div>
    </div>
  );
}

function ReadinessRow({
  check,
  compact = false,
}: {
  check: ExternalReadinessReport['checks'][number];
  compact?: boolean;
}) {
  const status = {
    missing: ['missing', 'bg-coral text-white'],
    manual_required: ['manual', 'bg-[#E5B23C] text-[#18110A]'],
    optional: ['optional', 'bg-[#2A241F] text-[#D8CFC6]'],
    ready: ['ready', 'bg-[#18210F] text-lime'],
  }[check.status];

  return (
    <div className="rounded-[10px] border border-[#2E2822] bg-[#221E19] p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{check.title}</span>
            <span className="text-xs text-[#8A7F76]">{check.area}</span>
          </div>
          {!compact && <div className="mt-1 text-xs leading-5 text-[#A79C92]">{check.note}</div>}
        </div>
        <span className={`rounded-chip px-2 py-1 text-[10px] font-bold uppercase ${status[1]}`}>
          {status[0]}
        </span>
      </div>

      {check.missingEnv.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#8A7F76]">
            Missing env
          </div>
          <div className="flex flex-wrap gap-1.5">
            {check.missingEnv.map((env) => (
              <code
                key={env}
                className="max-w-full break-all rounded bg-[#16130F] px-1.5 py-1 text-[11px] text-[#D8CFC6]"
              >
                {env}
              </code>
            ))}
          </div>
        </div>
      )}

      {check.manualChecks.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs text-[#D8CFC6]">
          {check.manualChecks.map((manual) => (
            <li key={manual} className="flex gap-2">
              <span className="mt-0.5 text-[#E5B23C]">□</span>
              <span>{manual}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
