import { API_BASE, getJson, postAuthJson } from './http';
import type { LedgerEvent } from '../reports';

export interface OrderLine {
  sku: string;
  qty: number;
  price: number;
}

export interface CreatedOrder {
  id: string;
  status: string;
  total: number;
}

/** Find-or-create a customer by phone (guest checkout). Throws on API error. */
export async function createCustomer(input: { phone: string; name?: string }): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/customers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`customers responded ${res.status}`);
  return (await res.json()) as { id: string };
}

/** Create an order from the storefront cart. Throws on API error. */
export async function createOrder(input: {
  customerId: string;
  channel: string;
  total: number;
  items: OrderLine[];
}): Promise<CreatedOrder> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`orders responded ${res.status}`);
  return (await res.json()) as CreatedOrder;
}

export interface MyOrder {
  id: string;
  channel: string;
  status: string;
  total: number;
  createdAt: string;
  items: { sku: string; qty: number; price: number }[];
}

export function fetchMyOrders(accessToken: string): Promise<MyOrder[]> {
  return getJson('/orders/mine', accessToken);
}

export interface QueueOrder {
  id: string;
  channel: string;
  status: string;
  total: number;
  createdAt: string;
  customer?: { phone: string; name: string };
  items: { sku: string; qty: number; price: number; imei?: string | null }[];
}

export async function fetchOrdersByStatus(status: string, accessToken: string): Promise<QueueOrder[]> {
  const res = await fetch(`${API_BASE}/orders?status=${encodeURIComponent(status)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`orders queue ${res.status}`);
  return (await res.json()) as QueueOrder[];
}

export function fulfillOrder(
  id: string,
  accessToken: string,
): Promise<{ order?: { status: string }; assigned: string[] }> {
  return postAuthJson(`/orders/${id}/fulfill`, {}, accessToken);
}

export function transitionOrder(id: string, to: string, accessToken: string): Promise<{ status: string }> {
  return postAuthJson(`/orders/${id}/transition`, { to }, accessToken);
}

export interface OrderDetail {
  id: string;
  channel: string;
  status: string;
  total: number;
  createdAt: string;
  items: { sku: string; qty: number; price: number; imei?: string | null }[];
  payments: { amount: number; method: string; status: string }[];
}

export async function fetchOrder(id: string): Promise<OrderDetail | null> {
  const res = await fetch(`${API_BASE}/orders/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`order ${res.status}`);
  return (await res.json()) as OrderDetail;
}

export function fetchOrderLedger(id: string, accessToken: string): Promise<LedgerEvent[]> {
  return getJson(`/orders/${encodeURIComponent(id)}/ledger`, accessToken);
}
