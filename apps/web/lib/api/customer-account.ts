import { API_BASE, deleteAuthJson, getJson, patchAuthJson } from './http';

export interface CustomerLoyalty {
  balance: number;
  conversion: number;
  level: string;
  nextLevelSpend: number;
  coupons: { id: string; title: string; code: string; valueLabel: string; expiresAt: string | null }[];
  history: { id: string; label: string; amount: number; createdAt: string }[];
}

export interface CustomerAddress {
  id: string;
  title: string;
  text: string;
  comment: string | null;
  isPrimary: boolean;
}

export interface CustomerSettings {
  id: string;
  phone: string;
  name: string;
  consent: boolean;
  push: boolean;
  whatsapp: boolean;
  service: boolean;
  promos: boolean;
}

export const fetchMyLoyalty = (token: string) => getJson<CustomerLoyalty>('/customers/me/loyalty', token);
export const fetchMyAddresses = (token: string) => getJson<CustomerAddress[]>('/customers/me/addresses', token);
export const fetchMySettings = (token: string) => getJson<CustomerSettings>('/customers/me/settings', token);

export async function createMyAddress(
  body: { title: string; text: string; comment?: string; isPrimary?: boolean },
  idempotencyKey: string,
  token: string,
): Promise<CustomerAddress> {
  const response = await fetch(`${API_BASE}/customers/me/addresses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { message?: string }).message ?? `request failed ${response.status}`);
  }
  return response.json() as Promise<CustomerAddress>;
}

export const updateMyAddress = (id: string, body: Partial<Pick<CustomerAddress, 'title' | 'text' | 'comment' | 'isPrimary'>>, token: string) =>
  patchAuthJson<CustomerAddress>(`/customers/me/addresses/${id}`, body, token);

export const deleteMyAddress = (id: string, token: string) =>
  deleteAuthJson<{ id: string }>(`/customers/me/addresses/${id}`, {}, token);

export const updateMySettings = (body: Partial<Omit<CustomerSettings, 'id' | 'phone'>>, token: string) =>
  patchAuthJson<CustomerSettings>('/customers/me/settings', body, token);
