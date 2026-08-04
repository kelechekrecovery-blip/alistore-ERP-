import { getJson, postAuthJson } from './http';
import type { PosReceiptSnapshot } from '../pos-offline';
import type { PosSaleResult } from './pos';

/** Mirrors the API's ReceiptData DTO (receipts/receipts.dto.ts). */
export interface ReceiptData {
  store: { name: string; address?: string; phone?: string };
  orderId: string;
  issuedAt: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  payment: string;
  payments?: { method: string; amount: number }[];
  cashier?: string;
}

/** receiptline markup + SVG preview + ESC/POS (base64) rendered by the server. */
export interface RenderedReceipt {
  markup: string;
  svg: string;
  escposBase64: string;
  fiscal: {
    status: string;
    fiscalNumber: string | null;
    qrPayload: string | null;
    providerReference: string | null;
  };
}

export const renderServerReceipt = (data: ReceiptData, accessToken: string) =>
  postAuthJson<RenderedReceipt>('/receipts/render', data, accessToken);

export const fetchOrderReceipt = (orderId: string, accessToken: string) =>
  getJson<RenderedReceipt>(`/receipts/order/${orderId}`, accessToken);

/** Map the local POS receipt snapshot onto the server's ReceiptData contract. */
export function buildReceiptData(snapshot: PosReceiptSnapshot, result?: PosSaleResult | null): ReceiptData {
  return {
    store: { name: snapshot.shop },
    orderId: result?.orderId ?? snapshot.clientSaleId,
    issuedAt: snapshot.createdAt,
    items: snapshot.lines.map((line) => ({ name: line.name, qty: line.qty, price: line.price })),
    total: snapshot.total,
    payment: snapshot.method,
    payments: snapshot.payments,
    cashier: snapshot.cashier,
  };
}
