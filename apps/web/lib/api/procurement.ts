import { getJson, postAuthJson } from './http';

export type PurchaseOrderStatus = 'draft' | 'sent' | 'receiving' | 'received' | 'cancelled';
export type SupplyOperationQueueKey =
  | 'awaiting_deposit'
  | 'draft_po'
  | 'late'
  | 'received'
  | 'ready'
  | 'cancellation_awaiting_owner'
  | 'refund_failed';

export interface SupplyOperationRow {
  id: string;
  queue: SupplyOperationQueueKey;
  orderId: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  status: string;
  amount: number | null;
  expectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sku: string | null;
  quantity: number | null;
  detailHref: string;
}

export interface SupplyOperationsReport {
  generatedAt: string;
  capabilities: {
    financialQueuesVisible: boolean;
    ownerResolutionAvailable: boolean;
    toOrderCheckoutEnabled: boolean;
    cancellationEnabled: boolean;
  };
  counts: Record<SupplyOperationQueueKey, number>;
  queues: Record<SupplyOperationQueueKey, SupplyOperationRow[]>;
}

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

export const fetchSupplyOperations = (accessToken: string) =>
  getJson<SupplyOperationsReport>('/procurement/supply-operations', accessToken);

export function visibleSupplyOperationRows(
  report: SupplyOperationsReport,
  queue: SupplyOperationQueueKey,
  search: string,
): SupplyOperationRow[] {
  const query = search.trim().toLowerCase();
  if (!query) return report.queues[queue];
  return report.queues[queue].filter((row) => (
    row.orderId.toLowerCase().includes(query)
    || row.purchaseOrderNumber?.toLowerCase().includes(query)
    || row.sku?.toLowerCase().includes(query)
  ));
}

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

/** Supplier RMA scorecard row (mirrors apps/api/src/suppliers/scorecard.ts). */
export interface SupplierScore {
  supplierId: string;
  supplier: string;
  total: number;
  open: number;
  resolved: number;
  rejected: number;
  resolutionRate: number | null;
}

export const fetchSupplierScorecard = (accessToken: string) =>
  getJson<SupplierScore[]>('/suppliers/scorecard', accessToken);

/**
 * Resolution rate for display. `null` means no closed cases yet — shown as «—»,
 * not 0%, so a supplier with only open RMAs doesn't read as a failing one.
 */
export function formatResolutionRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}
