import { postAuthJson } from './http';

export interface PosLine {
  productId: string;
  sku: string;
  price: number;
  qty: number;
}

export interface PosPayment {
  method: string;
  amount: number;
}

export interface PosCustomer {
  name: string;
  phone: string;
  loyaltyBalance: number;
  binding: string;
}

export function findPosCustomer(
  phone: string,
  point: string,
  clientSaleId: string,
  accessToken: string,
): Promise<PosCustomer | null> {
  return postAuthJson('/pos/customers/lookup', { phone, point, clientSaleId }, accessToken);
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
  method?: string;
  payments?: PosPayment[];
  discountPct?: number;
  approvalId?: string;
  customerBinding?: string;
  clientSaleId?: string;
  lines: PosLine[];
}, accessToken: string): Promise<PosSaleOutcome> {
  return postAuthJson('/pos/sale', input, accessToken);
}
