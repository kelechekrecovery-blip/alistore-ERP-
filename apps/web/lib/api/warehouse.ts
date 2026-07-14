import { getJson, postAuthJson } from './http';

export interface TransferResult {
  imei: string;
  from: string;
  to: string;
  movementId: string;
}

export function transferUnit(
  imei: string,
  to: string,
  accessToken: string,
  reason?: string,
): Promise<TransferResult> {
  return postAuthJson('/inventory/transfer', { imei, to, reason }, accessToken);
}

export interface TransferQuantityResult {
  movementId: string;
  productId: string;
  from: string;
  to: string;
  qty: number;
  idempotent: boolean;
}

export function transferQuantityInventory(
  input: { idempotencyKey: string; productId: string; from: string; to: string; qty: number; reason?: string },
  accessToken: string,
): Promise<TransferQuantityResult> {
  return postAuthJson('/inventory/transfer-quantity', input, accessToken);
}

export interface CountResult {
  productId: string;
  location: string;
  expected: number;
  counted: number;
  diff: number;
  movementId: string;
}

export interface ReceiveResult {
  productId: string;
  location: string;
  received: number;
  imeis: string[];
  movementId: string;
}

export interface ReceiveQuantityResult {
  productId: string;
  location: string;
  received: number;
  onHand: number;
  reserved: number;
  available: number;
  movementId: string;
}

export function receiveInventoryBatch(
  productId: string,
  location: string,
  imeis: string[],
  accessToken: string,
  grade?: string,
): Promise<ReceiveResult> {
  return postAuthJson('/inventory/receive', { productId, location, imeis, grade }, accessToken);
}

export function receiveQuantityInventory(
  productId: string,
  location: string,
  quantity: number,
  accessToken: string,
): Promise<ReceiveQuantityResult> {
  return postAuthJson('/inventory/receive-quantity', { productId, location, quantity }, accessToken);
}

export function requestInventoryMovement(
  input: {
    productId: string;
    location: string;
    qty: number;
    type: 'write_off' | 'adjust';
    direction?: 'increase' | 'decrease';
    reason: string;
  },
  accessToken: string,
): Promise<{ approvalId: string }> {
  return postAuthJson('/inventory/movements', input, accessToken);
}

export function inventoryCount(
  productId: string,
  location: string,
  counted: number,
  accessToken: string,
): Promise<CountResult> {
  return postAuthJson('/inventory/count', { productId, location, counted }, accessToken);
}

export interface ConsignmentItem {
  id: string;
  ownerName: string;
  ownerContact?: string | null;
  commissionBps: number;
  status: 'active' | 'sold' | 'settled' | 'withdrawn';
  salePrice?: number | null;
  commissionAmount?: number | null;
  ownerAmount?: number | null;
  unit: { imei: string; location: string; status: string };
  product: { id: string; sku: string; name: string; price: number };
  saleOrder?: { id: string; status: string; createdAt: string } | null;
  payout?: { id: string; status: string; paidAt?: string | null } | null;
}

export interface ConsignmentPayout {
  id: string;
  ownerName: string;
  ownerContact?: string | null;
  grossAmount: number;
  commissionAmount: number;
  ownerAmount: number;
  status: 'created' | 'paid' | 'cancelled';
  paymentKey?: string | null;
  paidAt?: string | null;
  items: Array<{ id: string; ownerAmount?: number | null; saleOrderId?: string | null }>;
}

export interface ConsignmentAdjustment {
  id: string;
  returnId: string;
  itemId: string;
  payoutId: string;
  ownerName: string;
  ownerContact?: string | null;
  amount: number;
  reason: string;
  status: 'open' | 'settled';
  createdAt: string;
}

export function receiveConsignment(input: {
  idempotencyKey: string;
  productId: string;
  imei: string;
  location: string;
  ownerName: string;
  ownerContact?: string;
  commissionBps: number;
  grade?: string;
}, accessToken: string): Promise<ConsignmentItem> {
  return postAuthJson('/inventory/consignments/receive', input, accessToken);
}

export function fetchConsignments(accessToken: string): Promise<ConsignmentItem[]> {
  return getJson('/inventory/consignments', accessToken);
}

export function fetchConsignmentPayouts(accessToken: string): Promise<ConsignmentPayout[]> {
  return getJson('/inventory/consignments/payouts', accessToken);
}

export function fetchConsignmentAdjustments(accessToken: string): Promise<ConsignmentAdjustment[]> {
  return getJson('/inventory/consignments/adjustments', accessToken);
}

export function createConsignmentPayout(
  idempotencyKey: string,
  itemIds: string[],
  accessToken: string,
): Promise<ConsignmentPayout> {
  return postAuthJson('/inventory/consignments/payouts', { idempotencyKey, itemIds }, accessToken);
}

export function payConsignmentPayout(
  payoutId: string,
  paymentKey: string,
  accessToken: string,
): Promise<ConsignmentPayout> {
  return postAuthJson(`/inventory/consignments/payouts/${payoutId}/pay`, { paymentKey }, accessToken);
}
