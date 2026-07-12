import { getJson, postAuthJson } from './http';

export type PurchaseOrderStatus = 'draft' | 'sent' | 'receiving' | 'received' | 'cancelled';

export interface SupplierSummary {
  id: string;
  name: string;
  contact: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
  product: { id: string; sku: string; name: string };
}

export interface PurchaseOrder {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  location: string;
  note: string | null;
  createdBy: string;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  supplier: SupplierSummary;
  items: PurchaseOrderItem[];
  receipts: { id: string; idempotencyKey: string; actor: string; createdAt: string }[];
  idempotent?: boolean;
  receiptId?: string;
}

export const fetchSuppliers = (accessToken: string) => getJson<SupplierSummary[]>('/suppliers', accessToken);

export const fetchPurchaseOrders = (accessToken: string) =>
  getJson<PurchaseOrder[]>('/procurement/purchase-orders', accessToken);

export const createPurchaseOrder = (
  input: {
    idempotencyKey: string;
    supplierId: string;
    location: string;
    note?: string;
    items: { productId: string; qty: number; unitCost: number }[];
  },
  accessToken: string,
) => postAuthJson<PurchaseOrder>('/procurement/purchase-orders', input, accessToken);

export const sendPurchaseOrder = (id: string, accessToken: string) =>
  postAuthJson<PurchaseOrder>(`/procurement/purchase-orders/${encodeURIComponent(id)}/send`, {}, accessToken);

export const cancelPurchaseOrder = (id: string, accessToken: string) =>
  postAuthJson<PurchaseOrder>(`/procurement/purchase-orders/${encodeURIComponent(id)}/cancel`, {}, accessToken);

export const receivePurchaseOrder = (
  id: string,
  input: { idempotencyKey: string; lines: { itemId: string; imeis: string[]; grade?: 'A' | 'B' | 'C' }[] },
  accessToken: string,
) => postAuthJson<PurchaseOrder>(`/procurement/purchase-orders/${encodeURIComponent(id)}/receive`, input, accessToken);
