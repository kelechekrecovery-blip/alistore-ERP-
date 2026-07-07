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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
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

export const fetchDashboard = () => get<Dashboard>('/reports/dashboard');
export const fetchKpi = () => get<Kpi>('/reports/kpi');
/** Daily revenue buckets for the last N days (dashboard period filter). */
export const fetchRevenue = (days: number) =>
  get<{ day: string; amount: number }[]>(`/reports/revenue?days=${days}`);
export const fetchRisks = () => get<{ count: number; signals: RiskSignal[] }>('/reports/risks');
export const fetchLedger = () => get<LedgerEvent[]>('/reports/ledger');
/** Ledger events referencing a specific id (e.g. an orderId) — powers order tracking. */
export const fetchLedgerByRef = (ref: string) =>
  get<LedgerEvent[]>(`/reports/ledger?ref=${encodeURIComponent(ref)}`);
