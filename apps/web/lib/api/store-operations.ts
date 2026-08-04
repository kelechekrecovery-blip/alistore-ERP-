import { getJson, postAuthJson } from './http';

export type StoreChecklistType = 'opening' | 'closing';
export type StoreChecklistItem = {
  id: string; code: string; label: string; required: boolean; checked: boolean;
  checkedBy: string | null; checkedAt: string | null; note: string | null;
};
export type StoreChecklist = {
  id: string; point: string; businessDate: string; type: StoreChecklistType; status: 'open' | 'completed';
  startedBy: string; completedBy: string | null; completedAt: string | null; items: StoreChecklistItem[];
};
export type StoreIncident = {
  id: string; point: string; businessDate: string; category: string; severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved'; title: string; description: string; resolution: string | null;
  createdBy: string; resolvedBy: string | null; resolvedAt: string | null; createdAt: string;
};
export type StoreOperationsOverview = {
  date: string; point: string | null; checklists: StoreChecklist[]; incidents: StoreIncident[];
  summary: { checklists: number; completedChecklists: number; openIncidents: number; criticalIncidents: number };
};

export function fetchStoreOperationsOverview(date: string, point: string, token: string) {
  const query = new URLSearchParams({ date });
  if (point.trim()) query.set('point', point.trim());
  return getJson<StoreOperationsOverview>(`/store-operations/overview?${query}`, token);
}

export function createStoreChecklist(input: { point: string; type: StoreChecklistType; businessDate: string }, token: string, idempotencyKey: string) {
  return postAuthJson<StoreChecklist>('/store-operations/checklists', input, token, { 'idempotency-key': idempotencyKey });
}

export function updateStoreChecklistItem(checklistId: string, code: string, input: { checked: boolean; note?: string }, token: string, idempotencyKey: string) {
  return postAuthJson<StoreChecklistItem>(`/store-operations/checklists/${encodeURIComponent(checklistId)}/items/${encodeURIComponent(code)}`, input, token, { 'idempotency-key': idempotencyKey });
}

export function completeStoreChecklist(id: string, token: string, idempotencyKey: string) {
  return postAuthJson<StoreChecklist>(`/store-operations/checklists/${encodeURIComponent(id)}/complete`, {}, token, { 'idempotency-key': idempotencyKey });
}

export function createStoreIncident(input: { point: string; businessDate: string; category: string; severity: StoreIncident['severity']; title: string; description: string }, token: string, idempotencyKey: string) {
  return postAuthJson<StoreIncident>('/store-operations/incidents', input, token, { 'idempotency-key': idempotencyKey });
}

export function resolveStoreIncident(id: string, resolution: string, token: string, idempotencyKey: string) {
  return postAuthJson<StoreIncident>(`/store-operations/incidents/${encodeURIComponent(id)}/resolve`, { resolution }, token, { 'idempotency-key': idempotencyKey });
}
