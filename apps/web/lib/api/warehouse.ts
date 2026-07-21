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

export interface InventoryValuationReconciliation {
  generatedAt: string;
  scope: 'owned_inventory';
  summary: {
    quantityValue: number;
    serializedValue: number;
    ownedInventoryValue: number;
    glInventoryBalance: number;
    difference: number;
    inconsistentQuantityRows: number;
    missingSerializedCostUnits: number;
    complete: boolean;
    consistent: boolean;
  };
  quantity: Array<{
    productId: string;
    sku: string;
    name: string;
    location: string;
    onHand: number;
    reserved: number;
    consignmentQty: number;
    ownedPhysicalQty: number;
    layerQty: number;
    inventoryValue: number;
    layerValue: number;
    quantityDifference: number;
    valueDifference: number;
    reservationDifference: number;
    consistent: boolean;
  }>;
  serialized: Array<{
    productId: string;
    sku: string;
    name: string;
    location: string;
    units: number;
    inventoryValue: number;
    missingCostUnits: number;
  }>;
}

export function fetchInventoryValuationReconciliation(
  accessToken: string,
): Promise<InventoryValuationReconciliation> {
  return getJson('/inventory/valuation/reconciliation', accessToken);
}

export interface InventoryValuationRollForward {
  generatedAt: string;
  period: { from: string; to: string; semantics: '[from,to)' };
  scope: 'owned_inventory';
  summary: {
    openingValue: number;
    closingValue: number;
    glOpening: number;
    glMovement: number;
    glClosing: number;
    openingDifference: number;
    closingDifference: number;
    missingReversalQuantity: number;
    incompleteTransfers: number;
    incompleteSerializedReceipts: number;
    incompleteServiceConsumptions: number;
    unknownIssueLocations: number;
    unknownReversalLocations: number;
    legacyConsignmentIssues: number;
    incompleteQuantityBalances: number;
    complete: boolean;
    consistent: boolean;
  };
  rows: Array<{
    productId: string;
    sku: string;
    name: string;
    location: string;
    opening: { quantity: number; value: number };
    receipts: { quantity: number; value: number };
    returns: { quantity: number; value: number };
    transferIn: { quantity: number; value: number };
    transferOut: { quantity: number; value: number };
    issues: { quantity: number; value: number };
    adjustmentsIn: { quantity: number; value: number };
    adjustmentsOut: { quantity: number; value: number };
    closing: { quantity: number; value: number };
  }>;
}

export function fetchInventoryValuationRollForward(
  from: string,
  to: string,
  accessToken: string,
): Promise<InventoryValuationRollForward> {
  const query = new URLSearchParams({ from, to });
  return getJson(`/inventory/valuation/roll-forward?${query}`, accessToken);
}

export type QuarantineDiagnosis = 'resellable' | 'repair' | 'write_off';
export type QuarantineDisposition = 'restock' | 'repair' | 'write_off';

export interface InventoryQuarantineCase {
  id: string;
  sourceType: 'return' | 'exchange';
  returnId: string;
  reason: string;
  unitCost: number;
  status: 'pending_diagnosis' | 'diagnosed' | 'disposed';
  diagnosis?: QuarantineDiagnosis | null;
  disposition?: QuarantineDisposition | null;
  notes?: string | null;
  createdBy: string;
  diagnosedBy?: string | null;
  disposedBy?: string | null;
  diagnosedAt?: string | null;
  disposedAt?: string | null;
  dispositionApprovalId?: string | null;
  repairWorkOrderId?: string | null;
  createdAt: string;
  unit: {
    imei: string;
    location: string;
    status: string;
    acquisitionCost?: number | null;
    product: { id: string; sku: string; name: string };
  };
}

export function fetchInventoryQuarantine(accessToken: string): Promise<InventoryQuarantineCase[]> {
  return getJson('/inventory/quarantine', accessToken);
}

export function diagnoseInventoryQuarantine(
  id: string,
  input: { diagnosis: QuarantineDiagnosis; notes?: string },
  accessToken: string,
): Promise<InventoryQuarantineCase> {
  return postAuthJson(`/inventory/quarantine/${id}/diagnose`, input, accessToken);
}

export function disposeInventoryQuarantine(
  id: string,
  disposition: QuarantineDisposition,
  accessToken: string,
): Promise<InventoryQuarantineCase | { approvalId: string; status: 'requested' }> {
  return postAuthJson(`/inventory/quarantine/${id}/dispose`, { disposition }, accessToken);
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
  // idempotencyKey обязателен на сервере (защита от двойного оприходования).
  // Без него запрос резался ValidationPipe и вся приёмка количественного
  // товара падала с 400 — регрессия после того, как ключ стал обязательным.
  // Соседний transferQuantity его давно шлёт.
  return postAuthJson(
    '/inventory/receive-quantity',
    { idempotencyKey: crypto.randomUUID(), productId, location, quantity },
    accessToken,
  );
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
  quantityAllocations: Array<{ id: string; ownerAmount?: number | null; saleOrderId?: string | null; qty: number }>;
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

export interface QuantityConsignmentAllocation {
  id: string;
  qty: number;
  status: 'active' | 'sold' | 'settled' | 'withdrawn';
  salePrice?: number | null;
  commissionAmount?: number | null;
  ownerAmount?: number | null;
  saleOrder?: { id: string; status: string; createdAt: string } | null;
  payout?: { id: string; status: string; paidAt?: string | null } | null;
}

export interface QuantityConsignmentLot {
  id: string;
  location: string;
  ownerName: string;
  ownerContact?: string | null;
  commissionBps: number;
  receivedQty: number;
  availableQty: number;
  reservedQty: number;
  product: { id: string; sku: string; name: string; price: number };
  allocations: QuantityConsignmentAllocation[];
}

export function receiveQuantityConsignment(input: {
  idempotencyKey: string;
  productId: string;
  location: string;
  quantity: number;
  ownerName: string;
  ownerContact?: string;
  commissionBps: number;
}, accessToken: string): Promise<QuantityConsignmentLot> {
  return postAuthJson('/inventory/consignments/receive-quantity', input, accessToken);
}

export function fetchQuantityConsignments(accessToken: string): Promise<QuantityConsignmentLot[]> {
  return getJson('/inventory/consignments/quantity', accessToken);
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
  quantityAllocationIds: string[],
  accessToken: string,
): Promise<ConsignmentPayout> {
  return postAuthJson('/inventory/consignments/payouts', { idempotencyKey, itemIds, quantityAllocationIds }, accessToken);
}

export function payConsignmentPayout(
  payoutId: string,
  paymentKey: string,
  accessToken: string,
): Promise<ConsignmentPayout> {
  return postAuthJson(`/inventory/consignments/payouts/${payoutId}/pay`, { paymentKey }, accessToken);
}
