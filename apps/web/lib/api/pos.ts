import { postJson } from './http';

export interface PosLine {
  productId: string;
  sku: string;
  price: number;
  qty: number;
}

export interface PosSaleResult {
  pendingApproval?: false;
  orderId: string;
  receiptNo: string;
  total: number;
  status: string;
  shiftId: string;
  imeis: string[];
}

/** Returned when the sale's discount exceeds the limit and must be approved first. */
export interface PosPendingApproval {
  pendingApproval: true;
  approvalId: string;
  discountPct: number;
}

export type PosSaleOutcome = PosSaleResult | PosPendingApproval;

export function posSale(input: {
  staffId: string;
  point: string;
  method: string;
  discountPct?: number;
  approvalId?: string;
  lines: PosLine[];
}): Promise<PosSaleOutcome> {
  return postJson('/pos/sale', input);
}
