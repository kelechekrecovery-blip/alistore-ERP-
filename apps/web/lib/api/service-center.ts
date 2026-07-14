import { getJson, postAuthJson } from './http';

export interface ServiceWorkOrder {
  id: string;
  warrantyCaseId: string;
  technicianId: string | null;
  diagnosticSummary: string | null;
  diagnosticFee: number;
  estimateAmount: number | null;
  estimatePreparedAt: string | null;
  estimateApprovedAt: string | null;
  estimateApprovedBy: string | null;
  repairStartedAt: string | null;
  repairCompletedAt: string | null;
  repairClosedAt: string | null;
  repairWarrantyUntil: string | null;
  completionSummary: string | null;
  replacementImei: string | null;
  point: string;
  payments: ServicePayment[];
  parts: ServicePart[];
  warrantyCase: {
    id: string;
    imei: string;
    customerId: string;
    problem: string;
    status: string;
    serviceType: 'warranty' | 'paid';
    deviceName: string | null;
    sla: string;
  };
}

export interface ServicePart {
  id: string;
  productId: string;
  balanceId: string;
  location: string;
  qty: number;
  status: 'reserved' | 'consumed' | 'released';
  product: { id: string; sku: string; name: string; cost?: number };
}

export interface ServicePayment {
  id: string;
  amount: number;
  method: string;
  status: string;
  shiftId: string | null;
  createdAt: string;
}

export interface ServicePaymentContext {
  id: string;
  warrantyCaseId: string;
  diagnosticSummary: string | null;
  estimateAmount: number | null;
  estimateApprovedAt: string | null;
  point: string;
  warrantyCase: Pick<ServiceWorkOrder['warrantyCase'], 'id' | 'imei' | 'customerId' | 'deviceName'>;
  customer: { id: string; name: string; phone: string } | null;
  paidTotal: number;
}

export interface ServicePaymentResult extends ServiceWorkOrder {
  paidTotal: number;
  shiftId: string;
}

export interface ServiceQueueItem {
  id: string;
  imei: string;
  customerId: string;
  problem: string;
  status: string;
  serviceType: 'warranty' | 'paid';
  deviceName: string | null;
  sla: string;
  slaState: 'on_track' | 'warning' | 'overdue' | 'met' | 'missed' | 'closed';
  assignee: string | null;
  productName: string;
  customer: { id: string; name: string; phone: string } | null;
  workOrder: Omit<ServiceWorkOrder, 'warrantyCase'> | null;
}

export interface ServiceLoanerLoan {
  id: string;
  deviceId: string;
  workOrderId: string;
  customerId: string;
  status: 'prepared' | 'issued' | 'overdue' | 'returned' | 'disputed' | 'cancelled';
  issueCondition: string;
  returnCondition: string | null;
  damageNote: string | null;
  depositAmount: number;
  agreementRef: string | null;
  dueAt: string;
  issuedAt: string | null;
  returnedAt: string | null;
  workOrder: { id: string; warrantyCase: ServiceWorkOrder['warrantyCase'] };
  device?: { id: string; unit: { id: string; imei: string; status: string; location: string; product: { id: string; name: string; sku: string } } };
}

export interface ServiceLoanerDevice {
  id: string;
  active: boolean;
  condition: string;
  unit: { id: string; imei: string; status: string; location: string; product: { id: string; name: string; sku: string } };
  loans: ServiceLoanerLoan[];
}

export function fetchServiceQueue(accessToken: string) {
  return getJson<ServiceQueueItem[]>('/service-center/queue', accessToken);
}

export function fetchServiceLoaners(accessToken: string) {
  return getJson<ServiceLoanerDevice[]>('/service-center/loaners', accessToken);
}

export function fetchMyServiceLoaners(accessToken: string) {
  return getJson<ServiceLoanerLoan[]>('/service-center/me/loaners', accessToken);
}

export function registerServiceLoaner(imei: string, condition: string, accessToken: string, idempotencyKey: string) {
  return postAuthJson<ServiceLoanerDevice>('/service-center/loaners/register', { imei, condition }, accessToken, { 'idempotency-key': idempotencyKey });
}

export function prepareServiceLoaner(workOrderId: string, input: { loanerDeviceId: string; dueAt: string; issueCondition: string; depositAmount: number; agreementRef?: string }, accessToken: string, idempotencyKey: string) {
  return postAuthJson<ServiceLoanerLoan>(`/service-center/work-orders/${encodeURIComponent(workOrderId)}/loaner/prepare`, input, accessToken, { 'idempotency-key': idempotencyKey });
}

export function issueServiceLoaner(loanId: string, accessToken: string, idempotencyKey: string) {
  return postAuthJson<ServiceLoanerLoan>(`/service-center/loaner-loans/${encodeURIComponent(loanId)}/issue`, {}, accessToken, { 'idempotency-key': idempotencyKey });
}

export function cancelServiceLoaner(loanId: string, accessToken: string, idempotencyKey: string) {
  return postAuthJson<ServiceLoanerLoan>(`/service-center/loaner-loans/${encodeURIComponent(loanId)}/cancel`, {}, accessToken, { 'idempotency-key': idempotencyKey });
}

export function returnServiceLoaner(loanId: string, input: { returnCondition: string; damageNote?: string }, accessToken: string, idempotencyKey: string) {
  return postAuthJson<ServiceLoanerLoan>(`/service-center/loaner-loans/${encodeURIComponent(loanId)}/return`, input, accessToken, { 'idempotency-key': idempotencyKey });
}

export function resolveServiceLoanerDispute(loanId: string, disposition: 'available' | 'written_off', accessToken: string, idempotencyKey: string) {
  return postAuthJson<ServiceLoanerLoan>(`/service-center/loaner-loans/${encodeURIComponent(loanId)}/resolve-dispute`, { disposition }, accessToken, { 'idempotency-key': idempotencyKey });
}

export function createServiceWorkOrder(
  input: { warrantyCaseId: string; technicianId?: string },
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<ServiceWorkOrder>('/service-center/work-orders', input, accessToken, { 'idempotency-key': idempotencyKey });
}

export function createPaidRepair(
  input: { phone: string; customerName: string; deviceName: string; serial: string; problem: string; technicianId?: string },
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<ServiceWorkOrder>('/service-center/paid-repairs', input, accessToken, { 'idempotency-key': idempotencyKey });
}

export function diagnoseServiceWorkOrder(
  id: string,
  input: { summary: string; estimateAmount: number; diagnosticFee: number },
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<ServiceWorkOrder>(`/service-center/work-orders/${encodeURIComponent(id)}/diagnose`, input, accessToken, { 'idempotency-key': idempotencyKey });
}

export function assignServiceTechnician(id: string, technicianId: string, accessToken: string, idempotencyKey: string) {
  return serviceMutation(`/service-center/work-orders/${encodeURIComponent(id)}/assign`, accessToken, idempotencyKey, { technicianId });
}

export function fetchMyServiceWorkOrders(accessToken: string) {
  return getJson<ServiceWorkOrder[]>('/service-center/me/work-orders', accessToken);
}

export function approveMyServiceEstimate(id: string, accessToken: string, idempotencyKey: string) {
  return postAuthJson<ServiceWorkOrder>(`/service-center/me/work-orders/${encodeURIComponent(id)}/approve-estimate`, {}, accessToken, { 'idempotency-key': idempotencyKey });
}

export function fetchServicePaymentContext(id: string, accessToken: string) {
  return getJson<ServicePaymentContext>(`/service-center/work-orders/${encodeURIComponent(id)}/payment-context`, accessToken);
}

export function payServiceWorkOrder(
  id: string,
  payments: Array<{ method: string; amount: number }>,
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<ServicePaymentResult>(
    `/service-center/work-orders/${encodeURIComponent(id)}/pay`,
    { payments },
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}

function serviceMutation(path: string, accessToken: string, idempotencyKey: string, body: object = {}) {
  return postAuthJson<ServiceWorkOrder>(path, body, accessToken, { 'idempotency-key': idempotencyKey });
}

export function reserveServicePart(id: string, productId: string, qty: number, accessToken: string, idempotencyKey: string) {
  return serviceMutation(`/service-center/work-orders/${encodeURIComponent(id)}/parts`, accessToken, idempotencyKey, { productId, qty });
}

export function releaseServicePart(id: string, partId: string, accessToken: string, idempotencyKey: string) {
  return serviceMutation(`/service-center/work-orders/${encodeURIComponent(id)}/parts/${encodeURIComponent(partId)}/release`, accessToken, idempotencyKey);
}

export function consumeServicePart(id: string, partId: string, accessToken: string, idempotencyKey: string) {
  return serviceMutation(`/service-center/work-orders/${encodeURIComponent(id)}/parts/${encodeURIComponent(partId)}/consume`, accessToken, idempotencyKey);
}

export function startServiceRepair(id: string, accessToken: string, idempotencyKey: string) {
  return serviceMutation(`/service-center/work-orders/${encodeURIComponent(id)}/start`, accessToken, idempotencyKey);
}

export function completeServiceRepair(id: string, summary: string, accessToken: string, idempotencyKey: string) {
  return serviceMutation(`/service-center/work-orders/${encodeURIComponent(id)}/complete`, accessToken, idempotencyKey, { summary });
}

export function replaceServiceDevice(id: string, replacementImei: string, summary: string, accessToken: string, idempotencyKey: string) {
  return serviceMutation(`/service-center/work-orders/${encodeURIComponent(id)}/replace`, accessToken, idempotencyKey, { replacementImei, summary });
}

export function closeServiceRepair(id: string, accessToken: string, idempotencyKey: string) {
  return serviceMutation(`/service-center/work-orders/${encodeURIComponent(id)}/close`, accessToken, idempotencyKey);
}

export function receivedServiceTotal(workOrder: Pick<ServiceWorkOrder, 'payments'>) {
  return (workOrder.payments ?? [])
    .reduce((sum, payment) => sum + payment.amount, 0);
}
