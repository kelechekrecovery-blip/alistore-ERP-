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
  warrantyCase: {
    id: string;
    imei: string;
    customerId: string;
    problem: string;
    status: string;
    sla: string;
  };
}

export interface ServiceQueueItem {
  id: string;
  imei: string;
  customerId: string;
  problem: string;
  status: string;
  sla: string;
  assignee: string | null;
  productName: string;
  customer: { id: string; name: string; phone: string } | null;
  workOrder: Omit<ServiceWorkOrder, 'warrantyCase'> | null;
}

export function fetchServiceQueue(accessToken: string) {
  return getJson<ServiceQueueItem[]>('/service-center/queue', accessToken);
}

export function createServiceWorkOrder(
  input: { warrantyCaseId: string; technicianId?: string },
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<ServiceWorkOrder>('/service-center/work-orders', input, accessToken, { 'idempotency-key': idempotencyKey });
}

export function diagnoseServiceWorkOrder(
  id: string,
  input: { summary: string; estimateAmount: number; diagnosticFee: number },
  accessToken: string,
  idempotencyKey: string,
) {
  return postAuthJson<ServiceWorkOrder>(`/service-center/work-orders/${encodeURIComponent(id)}/diagnose`, input, accessToken, { 'idempotency-key': idempotencyKey });
}

export function fetchMyServiceWorkOrders(accessToken: string) {
  return getJson<ServiceWorkOrder[]>('/service-center/me/work-orders', accessToken);
}

export function approveMyServiceEstimate(id: string, accessToken: string, idempotencyKey: string) {
  return postAuthJson<ServiceWorkOrder>(`/service-center/me/work-orders/${encodeURIComponent(id)}/approve-estimate`, {}, accessToken, { 'idempotency-key': idempotencyKey });
}
