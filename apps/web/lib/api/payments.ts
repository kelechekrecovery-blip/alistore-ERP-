import { postAuthJson, postJson } from './http';

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

export function createPaymentIntent(input: {
  orderId: string;
  method: OnlinePaymentMethod;
  amount: number;
  returnUrl?: string;
  actor?: string;
}): Promise<PaymentIntent> {
  return postJson('/payments/intents', input);
}

export function confirmSandboxPayment(input: {
  orderId: string;
  method: OnlinePaymentMethod;
  amount: number;
  txnId: string;
}): Promise<PaymentConfirmResult> {
  return postJson('/payments/webhooks/sandbox', { ...input, status: 'succeeded', actor: 'sandbox' });
}

export function payOrder(input: {
  orderId: string;
  method: PaymentMethod;
  amount: number;
  txnId?: string;
  giftCardCode?: string;
}): Promise<PaymentConfirmResult> {
  return postJson('/payments', input);
}

export function requestPaymentRefund(
  paymentId: string,
  input: { amount: number; reason: string },
  accessToken: string,
): Promise<{ approvalId: string; status: 'requested' }> {
  return postAuthJson(`/payments/${encodeURIComponent(paymentId)}/refund`, input, accessToken);
}
