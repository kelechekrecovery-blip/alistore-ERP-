import { postJson } from './http';

export interface TransferResult {
  imei: string;
  from: string;
  to: string;
  movementId: string;
}

export function transferUnit(imei: string, to: string, reason?: string): Promise<TransferResult> {
  return postJson('/inventory/transfer', { imei, to, reason });
}

export interface CountResult {
  productId: string;
  location: string;
  expected: number;
  counted: number;
  diff: number;
  movementId: string;
}

export function inventoryCount(productId: string, location: string, counted: number): Promise<CountResult> {
  return postJson('/inventory/count', { productId, location, counted });
}
