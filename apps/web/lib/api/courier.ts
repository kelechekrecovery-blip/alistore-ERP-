import { getJson, postAuthJson } from './http';

export interface CourierCustomer {
  name: string;
  phone: string;
}

export interface CourierDeliveryItem {
  sku: string;
  qty: number;
  price: number;
  imei?: string | null;
}

export interface CourierPayment {
  amount: number;
  status: string;
}

export interface CourierRunSummary {
  id: string;
  codTotal: number;
  collectedTotal: number;
  handedOver: boolean;
  handoverAmount?: number | null;
  handedOverAt?: string | null;
}

export interface CourierDelivery {
  id: string;
  status: 'courier_assigned' | 'out_for_delivery' | 'delivered';
  total: number;
  deliveryAddress?: string | null;
  deliverySlot?: string | null;
  customer: CourierCustomer;
  items: CourierDeliveryItem[];
  payments: CourierPayment[];
  courierRun?: CourierRunSummary | null;
}

export interface CourierHandoverResult extends CourierRunSummary {
  diff: number;
}

export function outstandingCourierCod(delivery: CourierDelivery): number {
  const settled = delivery.payments
    .filter((payment) => payment.status === 'received' || payment.status === 'reconciled')
    .reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
  return Math.max(0, delivery.total - settled);
}

export function fetchCourierDeliveries(accessToken: string) {
  return getJson<CourierDelivery[]>('/courier/me/deliveries', accessToken);
}

export function startCourierDelivery(orderId: string, accessToken: string, idempotencyKey: string) {
  return postAuthJson<CourierDelivery>(
    `/courier/orders/${encodeURIComponent(orderId)}/start`,
    {},
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}

export function completeCourierDelivery(
  orderId: string,
  input: { codAmount: number; reason?: string; evidenceIdempotencyKey: string },
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<CourierDelivery>(
    `/courier/orders/${encodeURIComponent(orderId)}/deliver`,
    input,
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}

export function failCourierDelivery(
  orderId: string,
  input: { reason: string; evidenceIdempotencyKey: string },
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<{ orderId: string; recorded: boolean; status: string }>(
    `/deliveries/${encodeURIComponent(orderId)}/fail`,
    input,
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}

export function fetchCourierRun(runId: string, accessToken: string) {
  return getJson<CourierRunSummary>(
    `/courier/runs/${encodeURIComponent(runId)}`,
    accessToken,
  );
}

export function removeCourierDelivery(
  orderId: string,
  reason: string,
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<{
    orderId: string;
    runId: string;
    status: 'paid';
    codReleased: number;
    codTotal: number;
    collectedTotal: number;
  }>(
    `/courier/orders/${encodeURIComponent(orderId)}/remove-from-run`,
    { reason },
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}

export function handoverCourierCod(
  input: { runId: string; amount: number; reason?: string },
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<CourierHandoverResult>(
    '/courier/handover',
    input,
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}
