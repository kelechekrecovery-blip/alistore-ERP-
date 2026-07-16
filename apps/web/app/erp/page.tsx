'use client';

import Link from 'next/link';
import { LogOut, Menu, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Card } from '@/components/erp/Card';
import { ReadinessView } from '@/components/erp/ReadinessView';
import { RiskCenterView } from '@/components/erp/RiskCenterView';
import { StockView } from '@/components/erp/StockView';
import { FinanceView } from '@/components/erp/FinanceView';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { HrView } from '@/components/erp/HrView';
import { LogisticsView } from '@/components/erp/LogisticsView';
import { ServiceCenterView } from '@/components/erp/ServiceCenterView';
import { StorefrontView } from '@/components/erp/StorefrontView';
import { AdminView } from '@/components/erp/AdminView';
import { StoreOperationsView } from '@/components/erp/StoreOperationsView';
import { clearStaffSession, loadStaffSession, type StaffSession } from '@/lib/staff-session';

type Route = 'dash' | 'admin' | 'ai' | 'pricing' | 'reorder' | 'finance' | 'stock' | 'hr' | 'logistics' | 'operations' | 'service' | 'kpi' | 'crm' | 'campaigns' | 'storefront' | 'risks' | 'readiness' | 'ledger';

const CORE_NAV: { id: Route; icon: string; label: string }[] = [
  { id: 'dash', icon: '▦', label: 'Дашборд' },
  { id: 'admin', icon: '⚙', label: 'Администрирование' },
  { id: 'stock', icon: '📦', label: 'Склад' },
  { id: 'finance', icon: '💰', label: 'Финансы' },
  { id: 'hr', icon: '◫', label: 'HR · Смены' },
  { id: 'logistics', icon: '⌖', label: 'Логистика' },
  { id: 'operations', icon: '✓', label: 'Операции точки' },
  { id: 'service', icon: '⚒', label: 'Сервис-центр' },
  { id: 'kpi', icon: '📈', label: 'Маржа · KPI' },
  { id: 'crm', icon: '💬', label: 'CRM · Инбокс' },
  { id: 'ai', icon: '🧠', label: 'Ассистент' },
];
const EXTENDED_NAV: { id: Route; icon: string; label: string }[] = [
  { id: 'pricing', icon: '🏷️', label: 'Цены' },
  { id: 'reorder', icon: '🛒', label: 'Закупки' },
  { id: 'campaigns', icon: '◌', label: 'Кампании' },
  { id: 'storefront', icon: '▤', label: 'Сайт · CMS витрины' },
  { id: 'risks', icon: '⚠', label: 'Риски' },
  { id: 'readiness', icon: '✓', label: 'Готовность' },
  { id: 'ledger', icon: '📜', label: 'Event Ledger' },
];
const TITLES: Record<Route, [string, string]> = {
  dash: ['Дашборд', 'Обзор сети · сегодня'],
  admin: ['Администрирование', 'Сайт · операции · доступы'],
  ai: ['AI-ассистент', 'Инсайты владельца из Event Ledger'],
  pricing: ['Ценовые рекомендации', 'Спрос/остаток → подсказка по цене'],
  reorder: ['Закупки', 'Что дозаказать по спросу/остатку'],
  finance: ['Финансы', 'Деньги · P&L'],
  hr: ['Команда', 'График смен · табель · отсутствия'],
  logistics: ['Логистика', 'Зоны · слоты · маршруты'],
  operations: ['Операции точки', 'Открытие · закрытие · инциденты'],
  service: ['Сервис-центр', 'Очередь · диагностика · сметы'],
  kpi: ['Маржа · KPI', 'Валовая маржа, средний чек, топ-товары'],
  stock: ['Склад', 'Остатки по статусам'],
  crm: ['CRM · Поддержка', 'Инбокс обращений + Customer 360'],
  campaigns: ['Кампании', 'Сегменты, consent-фильтр и ROI'],
  storefront: ['Управление сайтом', 'Товары · контент · промо · отзывы · публикации'],
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
  warranty_sla_breach: { tab: 'service' },
  rma_sla_breach: { href: '/warehouse' },
  ticket_sla_breach: { tab: 'crm' },
  debt_overdue: { tab: 'crm' },
  margin_leak: { tab: 'kpi' },
  stock_money_mismatch: { tab: 'stock' },
  imei_reuse: { href: '/warehouse' },
  repeat_returns: { tab: 'crm' },
  discount_frequency: { tab: 'kpi' },
  write_off_spike: { tab: 'stock' },
};

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
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const navigationCloseRef = useRef<HTMLButtonElement>(null);

  const closeNavigation = useCallback((restoreFocus = true) => {
    setNavigationOpen(false);
    if (restoreFocus && window.matchMedia('(max-width: 639px)').matches) {
      window.requestAnimationFrame(() => navigationTriggerRef.current?.focus());
    }
  }, []);

  function navigate(next: Route) {
    setRoute(next);
    closeNavigation();
  }

  useEffect(() => {
    setSession(loadStaffSession());
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const syncNavigationMode = () => setMobileNavigation(media.matches);
    syncNavigationMode();
    media.addEventListener('change', syncNavigationMode);
    return () => media.removeEventListener('change', syncNavigationMode);
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

  useEffect(() => {
    if (!mobileNavigation || !navigationOpen) return;
    navigationCloseRef.current?.focus();
    const handleNavigationKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeNavigation();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        navigationRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleNavigationKeys);
    return () => window.removeEventListener('keydown', handleNavigationKeys);
  }, [closeNavigation, mobileNavigation, navigationOpen]);

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
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-hidden bg-[#0E0C0A] font-sans text-white sm:items-center sm:overflow-auto sm:p-5">
      <div
        data-testid="erp-shell"
        className="relative flex h-full w-full max-w-[1280px] overflow-hidden bg-[#16130F] shadow-2xl sm:h-[820px] sm:max-h-full sm:rounded-[20px] sm:border sm:border-[#2E2822]"
      >
      {navigationOpen && (
        <button
          type="button"
          aria-label="Закрыть навигацию"
          data-testid="erp-navigation-overlay"
          onClick={() => closeNavigation()}
          className="fixed inset-0 z-30 bg-black/60 sm:hidden"
        />
      )}
      {/* SIDEBAR */}
      <aside
        id="erp-navigation"
        ref={navigationRef}
        role={mobileNavigation ? 'dialog' : undefined}
        aria-label={mobileNavigation ? 'Навигация ERP' : undefined}
        aria-modal={mobileNavigation && navigationOpen ? true : undefined}
        aria-hidden={mobileNavigation && !navigationOpen ? true : undefined}
        inert={mobileNavigation && !navigationOpen ? true : undefined}
        data-testid="erp-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-shrink-0 flex-col border-r border-[#2E2822] bg-[#1A1611] px-3 py-[18px] shadow-2xl transition-transform duration-200 sm:relative sm:z-auto sm:w-[230px] sm:translate-x-0 sm:shadow-none ${navigationOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-2.5 px-2 pb-4">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-coral font-display text-base font-extrabold text-white">A</span>
          <div>
            <div className="font-display text-sm font-extrabold">AliStore ERP</div>
            <div className="text-[10px] text-[#8A7F76]">Владелец</div>
          </div>
          <button ref={navigationCloseRef} type="button" onClick={() => closeNavigation()} aria-label="Закрыть меню" className="ml-auto grid h-9 w-9 place-items-center rounded-[8px] text-[#A79C92] hover:bg-[#221E19] hover:text-white sm:hidden">
            <X size={18} />
          </button>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {CORE_NAV.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(m.id)}
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
          <div className="mb-1 mt-3 border-t border-[#2E2822] px-3 pt-3 text-[10px] font-semibold uppercase text-[#6E645C]">
            Расширенные модули
          </div>
          {EXTENDED_NAV.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(m.id)}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] transition ${
                route === m.id ? 'bg-[#221E19] font-bold text-white' : 'font-medium text-[#A79C92] hover:text-white'
              }`}
            >
              <span className="text-base">{m.icon}</span>
              <span>{m.label}</span>
              {m.id === 'risks' && risks.length > 0 && <span className="ml-auto rounded-chip bg-coral px-1.5 text-[10px] font-bold text-white">{risks.length}</span>}
              {m.id === 'readiness' && readiness?.summary.blockingRemaining ? <span className="ml-auto rounded-chip bg-coral px-1.5 text-[10px] font-bold text-white">{readiness.summary.blockingRemaining}</span> : null}
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
      <main inert={mobileNavigation && navigationOpen ? true : undefined} data-testid="erp-main" className="min-w-0 w-full flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 flex min-h-[68px] items-center border-b border-[#2E2822] bg-[#16130F]/95 px-3 py-3 backdrop-blur sm:px-[26px] sm:py-4">
          <button ref={navigationTriggerRef} type="button" aria-label="Открыть навигацию" aria-controls="erp-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)} className="mr-2 grid h-10 w-10 flex-none place-items-center rounded-[8px] border border-[#2E2822] bg-[#1A1611] text-[#D8CFC6] sm:hidden">
            <Menu size={19} />
          </button>
          <div className="min-w-0">
            <div className="truncate font-display text-base font-bold sm:text-xl">{TITLES[route][0]}</div>
            <div className="hidden truncate text-xs text-[#8A7F76] sm:block">{TITLES[route][1]}</div>
          </div>
          <div className="ml-auto flex flex-none items-center gap-1.5 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate('ai')}
              aria-label="Открыть AI-ассистент"
              className="flex h-10 items-center gap-2 rounded-[8px] bg-coral px-3 text-xs font-semibold text-white transition hover:brightness-110 sm:px-4"
            >
              <Sparkles size={16} /><span className="hidden lg:inline">AI-ассистент</span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearStaffSession();
                setSession(null);
              }}
              aria-label="Выйти из staff-сессии"
              className="flex h-10 items-center gap-2 rounded-[8px] bg-[#221E19] px-3 text-xs font-semibold text-white/80 hover:text-white sm:px-4"
            >
              <LogOut size={16} /><span className="hidden lg:inline">Выйти staff</span>
            </button>
            <span className="hidden h-9 w-9 place-items-center rounded-full bg-[#2A241F] text-sm md:grid">В</span>
          </div>
        </div>

        <div className="min-w-0 px-3 py-4 sm:px-[26px] sm:py-[22px]">
          {route === 'dash' && (
            <DashboardView d={d} risks={risks} revenue={revenue} trend={trend} period={period} accessToken={session.accessToken} onPeriod={setPeriod} onSignal={actOnSignal} />
          )}
          {route === 'admin' && <AdminView role={session.role} username={session.username} onNavigate={setRoute} />}
          {route === 'ai' && <AiView insights={insights} />}
          {route === 'pricing' && <PricingView accessToken={session.accessToken} />}
          {route === 'reorder' && <ReorderView accessToken={session.accessToken} />}
          {route === 'finance' && <FinanceView d={d} accessToken={session.accessToken} />}
          {route === 'hr' && <HrView accessToken={session.accessToken} />}
          {route === 'logistics' && <LogisticsView accessToken={session.accessToken} />}
          {route === 'operations' && <StoreOperationsView accessToken={session.accessToken} />}
          {route === 'service' && <ServiceCenterView accessToken={session.accessToken} staffId={session.staffId} role={session.role} />}
          {route === 'kpi' && <KpiView kpi={kpi} accessToken={session.accessToken} />}
          {route === 'stock' && <StockView d={d} accessToken={session.accessToken} role={session.role} staffId={session.staffId} />}
          {route === 'crm' && <CrmView />}
          {route === 'campaigns' && <CampaignsView />}
          {route === 'storefront' && <StorefrontView accessToken={session.accessToken} role={session.role} />}
          {route === 'risks' && <RiskCenterView risks={risks} onSignal={actOnSignal} />}
          {route === 'readiness' && <ReadinessView report={readiness} error={readinessError} />}
          {route === 'ledger' && <LedgerView ledger={ledger} />}
        </div>
      </main>
      </div>
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
