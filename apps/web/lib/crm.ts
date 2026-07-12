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

export async function fetchTickets(status: string | undefined, accessToken: string): Promise<Ticket[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${API_BASE}/support/tickets${qs}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`tickets ${res.status}`);
  return (await res.json()) as Ticket[];
}

async function patchAuth<T>(path: string, body: unknown, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? `request ${res.status}`);
  }
  return (await res.json()) as T;
}

export function transitionTicket(id: string, to: string, accessToken: string): Promise<Ticket> {
  return patchAuth(`/support/tickets/${id}/transition`, { to }, accessToken);
}

export function escalateTicket(id: string, accessToken: string): Promise<Ticket> {
  return patchAuth(`/support/tickets/${id}/escalate`, {}, accessToken);
}

// ---------- Customer 360 ----------

export interface CustomerOverview {
  customer: { id: string; name: string; phone: string; consent: boolean; segments: string[]; ltv: number; createdAt: string };
  orders: { total: number; spent: number; recent: { id: string; status: string; total: number; createdAt: string }[] };
  debts: { count: number; openBalance: number; items: { id: string; balance: number; status: string; dueDate: string }[] };
  warranties: { open: number; items: { id: string; imei: string; status: string; sla: string }[] };
  tickets: { open: number; items: { id: string; subject: string; status: string; priority: string; sla: string }[] };
}

export async function fetchCustomerOverview(id: string, accessToken: string): Promise<CustomerOverview> {
  const res = await fetch(`${API_BASE}/customers/${id}/overview`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`overview ${res.status}`);
  return (await res.json()) as CustomerOverview;
}

export function setConsent(id: string, consent: boolean, accessToken: string): Promise<{ consent: boolean }> {
  return patchAuth(`/customers/${id}/consent`, { consent }, accessToken);
}
