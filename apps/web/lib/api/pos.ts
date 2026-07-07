import { postAuthJson } from './http';

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
  idempotent?: boolean;
}

/** Returned when the sale's discount exceeds the limit and must be approved first. */
export interface PosPendingApproval {
  pendingApproval: true;
  approvalId: string;
  discountPct: number;
  reason?: 'discount' | 'margin' | 'discount_and_margin';
  margin?: {
    minMargin: number;
    worstMargin: number;
    breaches: Array<{ sku: string; margin: number; minMargin: number }>;
  };
}

export type PosSaleOutcome = PosSaleResult | PosPendingApproval;

export function posSale(input: {
  staffId: string;
  point: string;
  method: string;
  discountPct?: number;
  approvalId?: string;
  clientSaleId?: string;
  lines: PosLine[];
}, accessToken: string): Promise<PosSaleOutcome> {
  return postAuthJson('/pos/sale', input, accessToken);
}
