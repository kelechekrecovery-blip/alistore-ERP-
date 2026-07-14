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
  subtotal?: number;
  deliveryFee?: number;
  promoCode?: string | null;
  promoDiscount?: number;
  loyaltyRedeemed?: number;
  loyaltyEarned?: number;
  fulfillmentType?: string;
  pickupPoint?: string | null;
  deliveryAddress?: string | null;
  deliverySlot?: string | null;
  pickupCode?: string | null;
}

/** Find-or-create a customer by phone (guest checkout). Throws on API error. */
export async function createCustomer(input: { phone: string; name?: string }): Promise<{ id: string; guestCapability: string; capabilityExpiresIn: number }> {
  const res = await fetch(`${API_BASE}/customers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`customers responded ${res.status}`);
  return (await res.json()) as { id: string; guestCapability: string; capabilityExpiresIn: number };
}

/** Create an order from the storefront cart. Throws on API error. */
export async function createOrder(input: {
  customerId: string;
  channel: string;
  fulfillmentType?: 'pickup' | 'courier' | 'express' | 'store';
  pickupPoint?: string;
  deliveryAddress?: string;
  deliverySlot?: string;
  total: number;
  promoCode?: string;
  loyaltyPoints?: number;
  items: OrderLine[];
}, guestCapability: string, idempotencyKey: string): Promise<CreatedOrder> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-guest-capability': guestCapability,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`orders responded ${res.status}`);
  return (await res.json()) as CreatedOrder;
}

export async function createMyOrder(input: {
  channel: 'web' | 'mobile';
  fulfillmentType?: 'pickup' | 'courier' | 'express' | 'store';
  pickupPoint?: string;
  deliveryAddress?: string;
  deliverySlot?: string;
  total: number;
  promoCode?: string;
  loyaltyPoints?: number;
  items: OrderLine[];
}, accessToken: string, idempotencyKey: string): Promise<CreatedOrder> {
  return postAuthJson('/orders/mine', input, accessToken, { 'idempotency-key': idempotencyKey });
}

export interface MyOrder {
  id: string;
  channel: string;
  fulfillmentType?: string;
  pickupPoint?: string | null;
  deliveryAddress?: string | null;
  deliverySlot?: string | null;
  pickupCode?: string | null;
  status: string;
  total: number;
  createdAt: string;
  items: { id: string; sku: string; qty: number; price: number; imei?: string | null }[];
}

export function fetchMyOrders(accessToken: string): Promise<MyOrder[]> {
  return getJson('/orders/mine', accessToken);
}

export interface QueueOrder {
  id: string;
  channel: string;
  fulfillmentType?: string;
  pickupPoint?: string | null;
  deliveryAddress?: string | null;
  deliverySlot?: string | null;
  pickupCode?: string | null;
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
  fulfillmentType?: string;
  pickupPoint?: string | null;
  deliveryAddress?: string | null;
  deliverySlot?: string | null;
  pickupCode?: string | null;
  status: string;
  total: number;
  createdAt: string;
  items: { sku: string; qty: number; price: number; imei?: string | null }[];
  payments: { amount: number; method: string; status: string }[];
}

export async function fetchOrder(id: string, accessToken: string): Promise<OrderDetail | null> {
  const res = await fetch(`${API_BASE}/orders/${id}`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`order ${res.status}`);
  return (await res.json()) as OrderDetail;
}

export function fetchOrderLedger(id: string, accessToken: string): Promise<LedgerEvent[]> {
  return getJson(`/orders/${encodeURIComponent(id)}/ledger`, accessToken);
}
