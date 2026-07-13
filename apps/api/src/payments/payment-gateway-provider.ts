import { OrderStatus, PaymentMethod } from '@prisma/client';

export const PAYMENT_GATEWAY_PROVIDER = Symbol('PAYMENT_GATEWAY_PROVIDER');

export type OnlinePaymentMethod = Extract<PaymentMethod, 'card' | 'qr_mbank' | 'qr_odengi' | 'installment'>;
export type PaymentProviderName = 'card' | 'mbank' | 'odengi' | 'installment' | 'production';

export interface PaymentIntentView {
  intentId: string;
  provider: PaymentProviderName;
  orderId: string;
  orderStatus: OrderStatus;
  method: OnlinePaymentMethod;
  amount: number;
  txnId: string;
  status: 'requires_action';
  expiresAt: string;
  paymentUrl: string;
  qrPayload: string | null;
}

export interface GatewayCreateIntentInput {
  idempotencyKey?: string;
  orderId: string;
  orderStatus: OrderStatus;
  method: OnlinePaymentMethod;
  amount: number;
  returnUrl?: string;
}

export interface GatewayWebhookPayload {
  method: OnlinePaymentMethod;
  orderId: string;
  amount: number;
  txnId: string;
  status: 'succeeded' | 'failed';
  actor?: string;
}

export interface GatewayWebhookRequest {
  payload: GatewayWebhookPayload;
  rawBody?: Buffer;
  headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface GatewayRefundInput {
  paymentId: string;
  providerTxnId: string;
  amount: number;
  idempotencyKey: string;
  reason: string;
}

export interface GatewayRefundResult {
  providerRefundId: string;
  status: 'accepted' | 'succeeded';
}

export interface PaymentGatewayProvider {
  readonly name: 'sandbox' | 'production';
  assertOperational(): void;
  createIntent(input: GatewayCreateIntentInput): Promise<PaymentIntentView>;
  verifyWebhook(input: GatewayWebhookRequest): Promise<GatewayWebhookPayload>;
  refund(input: GatewayRefundInput): Promise<GatewayRefundResult>;
}
