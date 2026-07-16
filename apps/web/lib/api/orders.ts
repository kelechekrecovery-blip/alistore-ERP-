import { API_BASE, getJson, postAuthJson } from './http';
import type { LedgerEvent } from '../reports';
import type { StoredAttribution } from '../attribution';

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
  storePointId?: string | null;
  storePointCode?: string | null;
  storePointName?: string | null;
  storePointAddress?: string | null;
  pickupPoint?: string | null;
  pickupAddress?: string | null;
  fulfillmentLocation?: string | null;
  deliveryAddress?: string | null;
  deliverySlot?: string | null;
  deliveryZoneId?: string | null;
  deliverySlotId?: string | null;
  pickupCode?: string | null;
  guestAccess?: { capability: string; expiresIn: number };
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
  paymentMode?: 'prepaid' | 'cod';
  storePointId?: string;
  deliveryAddress?: string;
  deliverySlot?: string;
  deliveryZoneId?: string;
  deliverySlotId?: string;
  total: number;
  promoCode?: string;
  attribution?: Pick<StoredAttribution, 'first' | 'last'>;
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
  paymentMode?: 'prepaid' | 'cod';
  storePointId?: string;
  deliveryAddress?: string;
  deliverySlot?: string;
  deliveryZoneId?: string;
  deliverySlotId?: string;
  total: number;
  promoCode?: string;
  attribution?: Pick<StoredAttribution, 'first' | 'last'>;
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

export interface GuestOrderView {
  order: OrderDetail;
  timeline: Array<{ type: string; ts: string }>;
}

export async function fetchGuestOrder(id: string, capability: string): Promise<GuestOrderView> {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(id)}/guest`, {
    cache: 'no-store',
    headers: { 'x-guest-capability': capability },
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'guest_access_invalid' : `guest order ${res.status}`);
  return (await res.json()) as GuestOrderView;
}

export async function fetchGuestReceipt(id: string, capability: string): Promise<{ markup: string }> {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(id)}/guest-receipt`, {
    cache: 'no-store',
    headers: { 'x-guest-capability': capability },
  });
  if (!res.ok) {
    if (res.status === 409) throw new Error('receipt_not_available');
    throw new Error(res.status === 401 || res.status === 403 ? 'guest_access_invalid' : `guest receipt ${res.status}`);
  }
  return (await res.json()) as { markup: string };
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
