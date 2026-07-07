import { API_BASE } from './api';

// ---------- Support Inbox ----------

export interface Ticket {
  id: string;
  customerId: string;
  channel: string;
  subject: string;
  body: string | null;
  priority: string;
  status: string;
  sla: string;
  assignee: string | null;
  createdAt: string;
}

export async function fetchTickets(status?: string): Promise<Ticket[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${API_BASE}/support/tickets${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`tickets ${res.status}`);
  return (await res.json()) as Ticket[];
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? `request ${res.status}`);
  }
  return (await res.json()) as T;
}

export function transitionTicket(id: string, to: string, actor = 'agent'): Promise<Ticket> {
  return patch(`/support/tickets/${id}/transition`, { to, actor });
}

export function escalateTicket(id: string, actor = 'lead'): Promise<Ticket> {
  return patch(`/support/tickets/${id}/escalate`, { actor });
}

// ---------- Customer 360 ----------

export interface CustomerOverview {
  customer: { id: string; name: string; phone: string; consent: boolean; segments: string[]; ltv: number; createdAt: string };
  orders: { total: number; spent: number; recent: { id: string; status: string; total: number; createdAt: string }[] };
  debts: { count: number; openBalance: number; items: { id: string; balance: number; status: string; dueDate: string }[] };
  warranties: { open: number; items: { id: string; imei: string; status: string; sla: string }[] };
  tickets: { open: number; items: { id: string; subject: string; status: string; priority: string; sla: string }[] };
}

export async function fetchCustomerOverview(id: string): Promise<CustomerOverview> {
  const res = await fetch(`${API_BASE}/customers/${id}/overview`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`overview ${res.status}`);
  return (await res.json()) as CustomerOverview;
}

export function setConsent(id: string, consent: boolean, actor = 'agent'): Promise<{ consent: boolean }> {
  return patch(`/customers/${id}/consent`, { consent, actor });
}
