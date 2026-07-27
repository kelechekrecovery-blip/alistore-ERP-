import { API_BASE, postAuthJson, postJson } from './http';

export type OnlinePaymentMethod = 'card' | 'qr_mbank' | 'qr_odengi' | 'installment';
export type PaymentMethod = OnlinePaymentMethod | 'cash' | 'gift_card';

export interface PaymentIntent {
  intentId: string;
  provider: 'card' | 'mbank' | 'odengi' | 'installment';
  orderId: string;
  orderStatus: string;
  method: OnlinePaymentMethod;
  amount: number;
  txnId: string;
  status: 'requires_action';
  expiresAt: string;
  paymentUrl: string;
  qrPayload: string | null;
}

export interface PaymentConfirmResult {
  order: { id: string; status: string; total: number } | null;
  payment: { id: string; amount: number; method: string; status: string; txnId?: string | null };
  idempotent: boolean;
}

export interface RefundAggregate {
  id: string;
  returnId: string;
  orderId: string;
  approvalId: string;
  amount: number;
  reason: string;
  status: string;
  approval: { id: string; status: string };
  allocations: Array<{
    id: string;
    amount: number;
    status: string;
    methodSnapshot: PaymentMethod;
    providerRefundId?: string | null;
    lastError?: string | null;
  }>;
}

export function resolveRefund(
  refundId: string,
  input: { action: 'confirm' | 'cancel'; reason: string; providerReference?: string },
  accessToken: string,
  idempotencyKey: string,
): Promise<RefundAggregate> {
  return postAuthJson(
    `/refunds/${encodeURIComponent(refundId)}/resolve`,
    input,
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}

export function createPaymentIntent(input: {
  orderId: string;
  method: OnlinePaymentMethod;
  amount: number;
  returnUrl?: string;
  actor?: string;
}, guestCapability: string, idempotencyKey: string): Promise<PaymentIntent> {
  return postJson('/payments/intents', input, {
    'x-guest-capability': guestCapability,
    'idempotency-key': idempotencyKey,
  });
}

export function createMyPaymentIntent(input: {
  orderId: string;
  method: OnlinePaymentMethod;
  amount: number;
  returnUrl?: string;
}, accessToken: string, idempotencyKey: string): Promise<PaymentIntent> {
  return postAuthJson('/payments/intents/mine', input, accessToken, { 'idempotency-key': idempotencyKey });
}

export function confirmSandboxPayment(input: {
  provider: PaymentIntent['provider'];
  intentId: string;
}): Promise<PaymentConfirmResult> {
  return postJson(
    `/sandbox/payments/${encodeURIComponent(input.provider)}/${encodeURIComponent(input.intentId)}/confirm-json`,
    {},
  );
}

export function payOrder(input: {
  orderId: string;
  method: PaymentMethod;
  amount: number;
  txnId?: string;
  giftCardCode?: string;
}, authorization: { accessToken?: string; guestCapability?: string }, idempotencyKey?: string): Promise<PaymentConfirmResult> {
  const headers = idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined;
  if (authorization.accessToken) return postAuthJson('/payments', input, authorization.accessToken, headers);
  return postJson('/payments', input, { 'x-guest-capability': authorization.guestCapability ?? '', ...(headers ?? {}) });
}

export function requestReturnRefund(
  returnId: string,
  input: { reason: string; shiftId?: string },
  accessToken: string,
  idempotencyKey: string,
): Promise<RefundAggregate> {
  return postAuthJson(
    `/returns/${encodeURIComponent(returnId)}/refunds`,
    input,
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}

export interface ServerPaymentMethods {
  online: boolean;
  methods: string[];
}

/**
 * Что сервер реально умеет провести. `null` — спросить не удалось; вызывающий
 * обязан отличать это от «онлайна нет», а не подставлять пустоту.
 */
export async function fetchPaymentMethods(): Promise<ServerPaymentMethods | null> {
  try {
    const response = await fetch(`${API_BASE}/payments/methods`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`payment methods responded ${response.status}`);
    return (await response.json()) as ServerPaymentMethods;
  } catch (error) {
    console.error('[payments] methods fetch failed', error);
    return null;
  }
}
