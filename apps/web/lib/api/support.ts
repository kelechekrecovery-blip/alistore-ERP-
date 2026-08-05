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
  { accessToken: string; idempotencyKey: string };

export interface GuestSupportTicketResponse {
  ticket: SupportTicket;
  guestCapability: string;
  capabilityExpiresIn: number;
}

export function openSupportTicket(input: SupportTicketInput, credential: SupportCredential): Promise<SupportTicket> {
  const { customerId: _customerId, actor: _actor, ...ownedInput } = input;
  return postJson('/support/tickets/mine', ownedInput, {
    authorization: `Bearer ${credential.accessToken}`,
    'idempotency-key': credential.idempotencyKey,
  });
}

export function openGuestSupportTicket(input: {
  phone: string;
  name?: string;
  channel: SupportTicketInput['channel'];
  subject: string;
  body?: string;
  priority?: SupportTicketInput['priority'];
}, idempotencyKey: string): Promise<GuestSupportTicketResponse> {
  return postJson('/support/tickets/guest', input, { 'idempotency-key': idempotencyKey });
}

export async function fetchSupportTickets(accessToken: string): Promise<SupportTicket[]> {
  const res = await fetch(`${API_BASE}/support/tickets/mine`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`support tickets ${res.status}`);
  return (await res.json()) as SupportTicket[];
}
