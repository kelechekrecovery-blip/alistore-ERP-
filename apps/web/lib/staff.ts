import { API_BASE } from './api';

export interface Shift {
  id: string;
  staffId: string;
  point: string;
  openCash: number;
  closeCash?: number | null;
  diff?: number | null;
  openedAt: string;
  closedAt?: string | null;
  payments?: { amount: number; method: string }[];
}

export async function currentShift(accessToken: string): Promise<Shift | null> {
  const res = await fetch(`${API_BASE}/shifts/current`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as Shift) : null;
}

export async function fetchShift(id: string, accessToken: string): Promise<Shift | null> {
  const res = await fetch(`${API_BASE}/shifts/${id}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as Shift;
}

export async function openShift(
  input: { staffId: string; point: string; openCash: number },
  accessToken: string,
): Promise<Shift> {
  const res = await fetch(`${API_BASE}/shifts/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`open shift ${res.status}`);
  return (await res.json()) as Shift;
}

export async function closeShift(
  id: string,
  closeCash: number,
  accessToken: string,
  reason?: string,
): Promise<Shift> {
  const res = await fetch(`${API_BASE}/shifts/${id}/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ closeCash, reason }),
  });
  if (!res.ok) throw new Error(`close shift ${res.status}`);
  return (await res.json()) as Shift;
}
