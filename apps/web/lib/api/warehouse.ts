import { postAuthJson } from './http';

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

export function inventoryCount(
  productId: string,
  location: string,
  counted: number,
  accessToken: string,
): Promise<CountResult> {
  return postAuthJson('/inventory/count', { productId, location, counted }, accessToken);
}
