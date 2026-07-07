import { API_BASE, postJson } from './http';

export interface SupportTicket {
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

export function openSupportTicket(input: {
  customerId: string;
  channel: 'web' | 'app' | 'whatsapp' | 'telegram' | 'call' | 'store';
  subject: string;
  body?: string;
  priority?: 'normal' | 'high' | 'urgent';
  actor?: string;
}): Promise<SupportTicket> {
  return postJson('/support/tickets', input);
}

export async function fetchSupportTickets(customerId: string): Promise<SupportTicket[]> {
  const res = await fetch(`${API_BASE}/support/tickets?customerId=${encodeURIComponent(customerId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`support tickets ${res.status}`);
  return (await res.json()) as SupportTicket[];
}
