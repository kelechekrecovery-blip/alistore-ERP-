import { API_BASE } from './api';

export interface Dashboard {
  money: { salesGross: number; refunds: number; net: number; byMethod: { method: string; amount: number }[] };
  orders: { total: number; byStatus: { status: string; count: number }[] };
  stock: { byStatus: { status: string; count: number }[] };
  ops: { openShifts: number; pendingApprovals: number };
  revenue7d: { day: string; amount: number }[];
}

export interface RiskSignal {
  kind: string;
  severity: 'high' | 'medium' | 'low';
  ref: string;
  detail: string;
}

export interface LedgerEvent {
  id: string;
  type: string;
  actor: string;
  ts: string;
  payload: Record<string, unknown>;
  refs: string[];
}

async function get<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export interface Kpi {
  revenue: number;
  cogs: number;
  grossMargin: number;
  marginPct: number;
  avgCheck: number;
  paidOrders: number;
  topProducts: { sku: string; name: string; units: number; revenue: number }[];
  sellers: { staffId: string; revenue: number; sales: number }[];
}

export interface PayrollRow {
  staffId: string;
  revenue: number;
  sales: number;
  base: number;
  commission: number;
  total: number;
}
export interface Payroll {
  base: number;
  commissionPct: number;
  rows: PayrollRow[];
  totalPayout: number;
}

export const fetchDashboard = (accessToken: string) => get<Dashboard>('/reports/dashboard', accessToken);
export const fetchKpi = (accessToken: string) => get<Kpi>('/reports/kpi', accessToken);
/** Seller payroll — base + commission on turnover (Phase 9). */
export const fetchPayroll = (accessToken: string) => get<Payroll>('/reports/payroll', accessToken);
/** Daily revenue buckets for the last N days (dashboard period filter). */
export const fetchRevenue = (days: number, accessToken: string) =>
  get<{ day: string; amount: number }[]>(`/reports/revenue?days=${days}`, accessToken);

export interface RevenueTrend {
  current: number;
  previous: number;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
}
/** Period-over-period revenue trend: last N days vs the N days before. */
export const fetchRevenueTrend = (days: number, accessToken: string) =>
  get<RevenueTrend>(`/reports/revenue-trend?days=${days}`, accessToken);

export interface RevenueRange {
  from: string;
  to: string;
  days: number;
  total: number;
  buckets: { day: string; amount: number }[];
  trend: RevenueTrend;
}
/** Revenue for an arbitrary [from, to] date range (YYYY-MM-DD, inclusive). */
export const fetchRevenueRange = (from: string, to: string, accessToken: string) =>
  get<RevenueRange>(`/reports/revenue-range?from=${from}&to=${to}`, accessToken);

export interface Insight {
  tone: 'positive' | 'warning' | 'info';
  title: string;
  detail: string;
}
/** Owner AI assistant — ledger-derived insights (keyless rules; LLM when a key is set). */
export const fetchInsights = (accessToken: string) =>
  get<{ source: string; insights: Insight[] }>('/ai/insights', accessToken);
export const fetchRisks = (accessToken: string) =>
  get<{ count: number; signals: RiskSignal[] }>('/reports/risks', accessToken);
export const fetchLedger = (accessToken: string) => get<LedgerEvent[]>('/reports/ledger', accessToken);
/** Ledger events referencing a specific id (e.g. an orderId) — powers order tracking. */
export const fetchLedgerByRef = (ref: string, accessToken: string) =>
  get<LedgerEvent[]>(`/reports/ledger?ref=${encodeURIComponent(ref)}`, accessToken);
