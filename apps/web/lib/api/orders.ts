import { API_BASE, getJson, postAuthJson, postJson } from './http';
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
  items?: CustomerOrderItem[];
  paymentSchedule?: OrderReceivableView[];
  initialDue?: number;
  balanceDue?: number;
  guestAccess?: { capability: string; expiresIn: number };
}

export interface OrderReceivableView {
  id: string;
  orderItemId: string | null;
  kind: 'supply_deposit' | 'stock_sale' | 'supply_balance' | 'delivery';
  amount: number;
  settledAmount: number;
  status: 'open' | 'partially_settled' | 'settled' | 'cancelled';
  dueAt?: string | null;
}

export interface CustomerOrderItem {
  id: string;
  sku: string;
  qty: number;
  price: number;
  discountAmount?: number;
  supplyModeSnapshot?: 'own_stock' | 'to_order';
  supplyLeadDaysSnapshot?: number | null;
  promisedDate?: string | null;
  fulfillmentStatus?: string;
  readyAt?: string | null;
  handedOverAt?: string | null;
  imei?: string | null;
  orderLineSupply?: {
    status: string;
    expectedAt?: string | null;
    orderedQty: number;
    receivedQty: number;
  } | null;
}

/**
 * Find-or-create a customer by phone (guest checkout).
 *
 * Goes through `postJson` so the API's own message reaches the shopper: a phone
 * that already belongs to an account answers 409 `guest_customer_requires_auth`
 * ("войдите в аккаунт перед оформлением заказа"), which is actionable — the raw
 * `customers responded 409` this used to throw was not.
 */
export async function createCustomer(input: { phone: string; name?: string }): Promise<{ id: string; guestCapability: string; capabilityExpiresIn: number }> {
  return postJson<{ id: string; guestCapability: string; capabilityExpiresIn: number }>('/customers', input);
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
  piiConsent?: boolean;
  items: OrderLine[];
}, guestCapability: string, idempotencyKey: string): Promise<CreatedOrder> {
  // postJson surfaces the API's error message (e.g. stock/price conflicts) instead
  // of the opaque `orders responded <status>` this used to throw.
  return postJson<CreatedOrder>('/orders', input, {
    'x-guest-capability': guestCapability,
    'idempotency-key': idempotencyKey,
  });
}

export async function createMyOrder(input: {
  /**
   * Сужать список нельзя: сервер принимает те же каналы, что и гостевой
   * `createOrder` (`apps/api/src/orders/orders.dto.ts` — `CreateMyOrderDto`
   * наследует ту же валидацию). Прежние `'web' | 'mobile'` были не контрактом, а
   * недосмотром, и из-за них Telegram Mini App не мог оформить заказ сессией
   * покупателя, хотя API это разрешал.
   */
  channel: 'web' | 'app' | 'mobile' | 'staff_mobile' | 'pos' | 'telegram';
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
  piiConsent?: boolean;
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
  subtotal?: number;
  deliveryFee?: number;
  total: number;
  createdAt: string;
  items: CustomerOrderItem[];
  receivables?: OrderReceivableView[];
  payments: { amount: number; method: string; status: string }[];
}

export interface OrderCancellationPreview {
  orderId: string;
  canCancel: boolean;
  blockedReason: string | null;
  policy: 'automatic_full' | 'owner_resolution';
  purchaseOrderSent: boolean;
  depositPaid: number;
  estimatedRefundAmount: number;
  supplierExpenseDeduction: number;
  ownerReviewRequired: boolean;
  note: string;
  requestEnabled: boolean;
  automaticRefundEnabled: boolean;
}

export interface OrderCancellationRequest {
  id: string;
  orderId: string;
  status: 'requested' | 'awaiting_owner' | 'approved' | 'refund_queued'
    | 'refund_processing' | 'refunded' | 'rejected' | 'refund_failed' | 'cancelled';
  policySnapshot: 'automatic_full' | 'owner_resolution';
  purchaseOrderSentSnapshot: boolean;
  depositPaidSnapshot: number;
  requestedRefundAmount: number;
  approvedRefundAmount: number | null;
  customerReason: string;
  refundId: string | null;
  createdAt: string;
  completedAt: string | null;
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

export function fetchOrderCancellationPreview(
  id: string,
  accessToken: string,
): Promise<OrderCancellationPreview> {
  return getJson(`/orders/mine/${encodeURIComponent(id)}/cancellation-preview`, accessToken);
}

export function requestOrderCancellation(
  id: string,
  reason: string,
  accessToken: string,
  idempotencyKey: string,
): Promise<OrderCancellationRequest> {
  return postAuthJson(
    `/orders/mine/${encodeURIComponent(id)}/cancellations`,
    { reason },
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}

export function fetchOrderLedger(id: string, accessToken: string): Promise<LedgerEvent[]> {
  return getJson(`/orders/${encodeURIComponent(id)}/ledger`, accessToken);
}
