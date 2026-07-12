import { API_BASE } from './api';

export interface WarrantyCase {
  id: string;
  imei: string;
  customerId: string;
  problem: string;
  status: string;
  sla: string;
  assignee?: string | null;
}

export async function fetchWarranty(params: {
  customerId?: string;
  imei?: string;
  status?: string;
  accessToken?: string;
}): Promise<WarrantyCase[]> {
  const qs = new URLSearchParams();
  if (params.customerId) qs.set('customerId', params.customerId);
  if (params.imei) qs.set('imei', params.imei);
  if (params.status) qs.set('status', params.status);
  const res = await fetch(`${API_BASE}/warranty?${qs.toString()}`, {
    cache: 'no-store',
    headers: params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : undefined,
  });
  if (!res.ok) throw new Error(`warranty ${res.status}`);
  return (await res.json()) as WarrantyCase[];
}

export async function openWarranty(input: {
  imei: string;
  customerId: string;
  problem: string;
}, credential: { accessToken?: string; guestCapability?: string }): Promise<WarrantyCase> {
  const res = await fetch(`${API_BASE}/warranty`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(credential.accessToken ? { authorization: `Bearer ${credential.accessToken}` } : {}),
      ...(credential.guestCapability ? { 'x-guest-capability': credential.guestCapability } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`open warranty ${res.status}`);
  return (await res.json()) as WarrantyCase;
}

export async function transitionWarranty(id: string, status: string, accessToken: string): Promise<WarrantyCase> {
  const res = await fetch(`${API_BASE}/warranty/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`transition warranty ${res.status}`);
  return (await res.json()) as WarrantyCase;
}
