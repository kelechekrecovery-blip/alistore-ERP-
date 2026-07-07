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

export function inventoryCount(
  productId: string,
  location: string,
  counted: number,
  accessToken: string,
): Promise<CountResult> {
  return postAuthJson('/inventory/count', { productId, location, counted }, accessToken);
}
