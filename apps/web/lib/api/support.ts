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

type SupportTicketInput = {
  customerId: string;
  channel: 'web' | 'app' | 'whatsapp' | 'telegram' | 'call' | 'store';
  subject: string;
  body?: string;
  priority?: 'normal' | 'high' | 'urgent';
  actor?: string;
};

type SupportCredential =
  | { accessToken: string; idempotencyKey: string }
  | { guestCapability: string };

export function openSupportTicket(input: SupportTicketInput, credential: SupportCredential): Promise<SupportTicket> {
  if ('accessToken' in credential) {
    const { customerId: _customerId, actor: _actor, ...ownedInput } = input;
    return postJson('/support/tickets/mine', ownedInput, {
      authorization: `Bearer ${credential.accessToken}`,
      'idempotency-key': credential.idempotencyKey,
    });
  }
  return postJson('/support/tickets', input, {
    'x-guest-capability': credential.guestCapability,
  });
}

export async function fetchSupportTickets(accessToken: string): Promise<SupportTicket[]> {
  const res = await fetch(`${API_BASE}/support/tickets/mine`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`support tickets ${res.status}`);
  return (await res.json()) as SupportTicket[];
}
