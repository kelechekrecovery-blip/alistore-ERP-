'use client';

import Link from 'next/link';
import { Bell, LogOut, Menu, Search, X } from 'lucide-react';
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
import { TasksView } from '@/components/erp/TasksView';
import { CrmView } from '@/components/erp/CrmView';
import { AiView } from '@/components/erp/AiView';
import { PricingView } from '@/components/erp/PricingView';
import { ReorderView } from '@/components/erp/ReorderView';
import { KpiView } from '@/components/erp/KpiView';
import { DashboardView } from '@/components/erp/DashboardView';
import { CampaignsView } from '@/components/erp/CampaignsView';
import { Card } from '@/components/erp/Card';
import { SettingsView } from '@/components/erp/SettingsView';
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
import { erpRouteAllowed, staffCan, type ErpRoute } from '@/lib/staff-permissions';

type Route = ErpRoute;

const CORE_NAV: { id: Route; icon: string; label: string }[] = [
  { id: 'dash', icon: '▦', label: 'Дашборд' },
  { id: 'stock', icon: '📦', label: 'Склад' },
  { id: 'finance', icon: '💰', label: 'Финансы' },
  { id: 'tasks', icon: '✅', label: 'Задачи' },
  { id: 'kpi', icon: '📊', label: 'KPI и ЗП' },
  { id: 'crm', icon: '👥', label: 'CRM' },
  { id: 'ai', icon: '🤖', label: 'AI-ассистент' },
];
const EXTENDED_NAV: { id: Route; icon: string; label: string }[] = [
  { id: 'admin', icon: '⚙', label: 'Администрирование' },
  { id: 'hr', icon: '◫', label: 'HR · Смены' },
  { id: 'logistics', icon: '⌖', label: 'Логистика' },
  { id: 'operations', icon: '✓', label: 'Операции точки' },
  { id: 'service', icon: '⚒', label: 'Сервис-центр' },
  { id: 'pricing', icon: '🏷️', label: 'Цены' },
  { id: 'reorder', icon: '🛒', label: 'Закупки' },
  { id: 'campaigns', icon: '◌', label: 'Кампании' },
  { id: 'storefront', icon: '▤', label: 'Управление сайтом' },
  { id: 'risks', icon: '⚠', label: 'Риски' },
  { id: 'readiness', icon: '✓', label: 'Готовность' },
  { id: 'settings', icon: '🎛', label: 'Параметры' },
  { id: 'ledger', icon: '📜', label: 'Event Ledger' },
];
const TITLES: Record<Route, [string, string]> = {
  dash: ['Дашборд', 'Обзор сети · сегодня'],
  settings: ['Параметры бизнеса', 'Скидки · зарплата · гарантия · выкуп · бонусы'],
  admin: ['Администрирование', 'Сайт · операции · доступы'],
  ai: ['AI-ассистент', 'Знает всю систему'],
  pricing: ['Ценовые рекомендации', 'Спрос/остаток → подсказка по цене'],
  reorder: ['Закупки', 'Что дозаказать по спросу/остатку'],
  finance: ['Финансы', 'Июнь 2026'],
  hr: ['Команда', 'График смен · табель · отсутствия'],
  logistics: ['Логистика', 'Зоны · слоты · маршруты'],
  operations: ['Операции точки', 'Открытие · закрытие · инциденты'],
  service: ['Сервис-центр', 'Очередь · диагностика · сметы'],
  kpi: ['KPI и зарплаты', 'Июнь 2026'],
  stock: ['Склад', '1 247 позиций · 3 филиала'],
  crm: ['CRM', 'База клиентов'],
  campaigns: ['Кампании', 'Сегменты, consent-фильтр и ROI'],
  storefront: ['Управление сайтом', 'Товары · контент · промо · отзывы · публикации'],
  risks: ['Риски', 'Центр тревог'],
  readiness: ['Готовность запуска', 'Внешние провайдеры · железо · production gate'],
  ledger: ['Event Ledger', 'Единая книга событий'],
  tasks: ['Задачи', 'Kanban команды'],
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
  // Cockpit loads used to swallow their failures (`.catch(() => setD(null))`),
  // so a dead endpoint was indistinguishable from a slow one: the screen sat on
  // «Загрузка…» forever with no error and no way to retry.
  const [cockpitError, setCockpitError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
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
    setCockpitError('');
    fetchDashboard(session.accessToken).then(setD).catch((cause) => {
      setD(null);
      setCockpitError(cause instanceof Error ? cause.message : 'Не удалось загрузить показатели');
    });
    fetchKpi(session.accessToken).then(setKpi).catch((cause) => {
      setKpi(null);
      setCockpitError(cause instanceof Error ? cause.message : 'Не удалось загрузить показатели');
    });
    fetchRisks(session.accessToken).then((r) => setRisks(r.signals)).catch(() => setRisks([]));
    fetchLedger(session.accessToken).then(setLedger).catch(() => setLedger([]));
    fetchInsights(session.accessToken).then((r) => setInsights(r.insights)).catch(() => setInsights([]));
    fetchExternalReadiness(session.accessToken)
      .then((report) => {
        setReadiness(report);
        setReadinessError('');
      })
      .catch(() => {
        setReadiness(null);
        setReadinessError('Не удалось загрузить readiness report');
      });
  }, [session, reloadToken]);

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
    if (kind === 'ai') {
      setRoute('ai');
      return;
    }
    const a = SIGNAL_ACTION[kind];
    if (a?.href) router.push(a.href);
    else if (a?.tab) setRoute(a.tab);
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-night p-4">
        <Link
          href="/"
          className="fixed right-4 top-4 z-[60] rounded-chip bg-surface-2 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
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

  // UI-STAFF-ADMIN: hide navigation the role has no API grant for (each view would 403).
  const coreNav = CORE_NAV.filter((m) => erpRouteAllowed(session.role, m.id));
  const extendedNav = EXTENDED_NAV.filter((m) => erpRouteAllowed(session.role, m.id));
  // Fall back to the always-open launcher when the current route is not granted.
  const activeRoute: Route = erpRouteAllowed(session.role, route) ? route : 'admin';

  return (
    <div className="erp3-stage fixed inset-0 z-50 flex items-stretch justify-center overflow-hidden font-sans text-white sm:items-center sm:overflow-auto sm:p-5">
      <div
        data-testid="erp-shell"
        className="erp3-shell relative flex h-full w-full max-w-[1280px] overflow-hidden sm:h-[844px] sm:max-h-full"
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-shrink-0 flex-col border-r border-white/10 bg-black/20 px-3 py-[18px] shadow-2xl backdrop-blur-2xl transition-transform duration-200 sm:relative sm:z-auto sm:w-[226px] sm:translate-x-0 sm:shadow-none ${navigationOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-2.5 px-2 pb-4">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-coral font-display text-[17px] font-extrabold text-white">A</span>
          <div>
            <div className="font-display text-[15px] font-extrabold">AliStore ERP</div>
            <div className="text-[10px] text-subtle">Владелец</div>
          </div>
          <button ref={navigationCloseRef} type="button" onClick={() => closeNavigation()} aria-label="Закрыть меню" className="ml-auto grid h-9 w-9 place-items-center rounded-[8px] text-muted hover:bg-surface-2 hover:text-white sm:hidden">
            <X size={18} />
          </button>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto">
          {coreNav.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(m.id)}
              className={`flex items-center gap-2.5 rounded-[12px] border px-3 py-[10px] text-left text-[13px] transition ${
                activeRoute === m.id ? 'erp3-glass-strong font-bold text-white' : 'border-transparent font-medium text-muted hover:border-white/10 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-base">{m.icon}</span>
              <span>{m.label}</span>
              {m.id === 'tasks' && (
                <span className="ml-auto rounded-chip bg-coral px-1.5 text-[10px] font-bold text-white">3</span>
              )}
            </button>
          ))}
          {extendedNav.length > 0 && (
            <div className="mb-1 mt-3 border-t border-surface-3 px-3 pt-3 text-[10px] font-semibold uppercase text-faint">
              Расширенные модули
            </div>
          )}
          {extendedNav.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(m.id)}
              aria-label={m.id === 'storefront' && ['owner', 'admin'].includes(session.role) ? 'Сайт · CMS витрины' : undefined}
              className={`flex items-center gap-2.5 rounded-[12px] border px-3 py-2 text-left text-[13px] transition ${
                activeRoute === m.id ? 'erp3-glass-strong font-bold text-white' : 'border-transparent font-medium text-muted hover:border-white/10 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-base">{m.icon}</span>
              <span>{m.label}</span>
              {m.id === 'risks' && risks.length > 0 && <span className="ml-auto rounded-chip bg-coral px-1.5 text-[10px] font-bold text-white">{risks.length}</span>}
              {m.id === 'readiness' && readiness?.summary.blockingRemaining ? <span className="ml-auto rounded-chip bg-coral px-1.5 text-[10px] font-bold text-white">{readiness.summary.blockingRemaining}</span> : null}
            </button>
          ))}
        </nav>
        <div className="erp3-glass mt-auto rounded-[14px] p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-[#4ED17A] shadow-[0_0_8px_#4ED17A]" />Сеть · онлайн</div>
          <div className="mt-0.5 text-[13px] font-semibold">3 филиала · онлайн</div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearStaffSession();
            setSession(null);
          }}
          aria-label="Выйти из staff-сессии"
          className="mt-2 flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-medium text-muted transition hover:text-white"
        >
          <LogOut size={16} />Выйти
        </button>
      </aside>

      {/* MAIN */}
      <main inert={mobileNavigation && navigationOpen ? true : undefined} data-testid="erp-main" className="min-w-0 w-full flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 flex min-h-[68px] items-center border-b border-white/10 bg-black/20 px-3 py-3 backdrop-blur-2xl sm:px-[26px] sm:py-4">
          <button ref={navigationTriggerRef} type="button" aria-label="Открыть навигацию" aria-controls="erp-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)} className="mr-2 grid h-10 w-10 flex-none place-items-center rounded-[8px] border border-surface-3 bg-surface text-bright sm:hidden">
            <Menu size={19} />
          </button>
          <div className="min-w-0">
            <div className="truncate font-display text-base font-bold sm:text-xl">{TITLES[activeRoute][0]}</div>
            <div className="hidden truncate text-xs text-subtle sm:block">{TITLES[activeRoute][1]}</div>
          </div>
          <div className="ml-auto flex flex-none items-center gap-2.5">
            <label className="hidden items-center gap-2 rounded-[10px] border border-white/10 bg-white/[.05] px-3 py-2 text-white/40 xl:flex">
              <Search size={15} />
              <input aria-label="Поиск по ERP" placeholder="Поиск товара, чека, клиента..." className="w-[190px] bg-transparent text-xs text-white outline-none placeholder:text-white/35" />
            </label>
            <button type="button" aria-label="Уведомления" className="relative hidden h-9 w-9 place-items-center rounded-[10px] border border-white/10 bg-white/[.05] text-white/65 hover:text-white sm:grid"><Bell size={16} /><span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[9px] font-bold text-white">5</span></button>
            <button
              type="button"
              onClick={() => navigate('ai')}
              aria-label="Открыть AI-ассистент"
              className="erp3-coral-action flex items-center gap-2 rounded-[11px] px-[15px] py-[9px] text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              <span>🤖</span><span className="hidden lg:inline">AI-ассистент</span>
            </button>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-sm text-white">В</span>
          </div>
        </div>

        <div className="min-w-0 px-3 py-4 sm:px-[26px] sm:py-[22px]">
          {cockpitError && (
            <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-[8px] border border-danger-soft/40 bg-danger-soft/10 px-3 py-2 text-xs text-danger-soft">
              <span>Не удалось загрузить данные кокпита: {cockpitError}</span>
              <button type="button" onClick={() => setReloadToken((value) => value + 1)} className="rounded-[6px] border border-danger-soft/50 px-2.5 py-1 font-semibold">Повторить</button>
            </div>
          )}
          {activeRoute === 'dash' && (
            <DashboardView d={d} risks={risks} revenue={revenue} trend={trend} period={period} accessToken={session.accessToken} onPeriod={setPeriod} onSignal={actOnSignal} />
          )}
          {activeRoute === 'tasks' && <TasksView />}
          {activeRoute === 'admin' && <AdminView role={session.role} username={session.username} accessToken={session.accessToken} onNavigate={setRoute} />}
          {activeRoute === 'ai' && <AiView insights={insights} />}
          {activeRoute === 'pricing' && <PricingView accessToken={session.accessToken} />}
          {activeRoute === 'reorder' && <ReorderView accessToken={session.accessToken} />}
          {activeRoute === 'finance' && <FinanceView d={d} accessToken={session.accessToken} />}
          {activeRoute === 'hr' && <HrView accessToken={session.accessToken} />}
          {activeRoute === 'logistics' && <LogisticsView accessToken={session.accessToken} />}
          {activeRoute === 'operations' && <StoreOperationsView accessToken={session.accessToken} />}
          {activeRoute === 'service' && <ServiceCenterView accessToken={session.accessToken} staffId={session.staffId} role={session.role} />}
          {activeRoute === 'kpi' && <KpiView kpi={kpi} accessToken={session.accessToken} />}
          {activeRoute === 'stock' && <StockView d={d} accessToken={session.accessToken} role={session.role} staffId={session.staffId} />}
          {activeRoute === 'crm' && <CrmView onOpenCampaigns={() => navigate('campaigns')} />}
          {activeRoute === 'campaigns' && <CampaignsView />}
          {activeRoute === 'storefront' && <StorefrontView accessToken={session.accessToken} role={session.role} />}
          {activeRoute === 'risks' && <RiskCenterView risks={risks} onSignal={actOnSignal} />}
          {activeRoute === 'readiness' && <ReadinessView report={readiness} error={readinessError} />}
          {activeRoute === 'settings' && <SettingsView accessToken={session.accessToken} canEdit={staffCan(session.role, 'settings', 'manage')} />}
          {activeRoute === 'ledger' && <LedgerView ledger={ledger} />}
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
          <li key={e.id} className="flex items-center gap-2 border-b border-surface-2 pb-2 text-xs">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-lime">{e.type}</span>
            <span className="text-subtle">{e.actor}</span>
            <span className="ml-auto font-mono text-[10px] text-faint">{e.ts.slice(11, 19)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
