import { getJson, postAuthJson } from './http';

export type ExpenseStatus = 'submitted' | 'approved' | 'rejected' | 'paid';

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  point: string | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  status: ExpenseStatus;
  requestedBy: string;
  approvedBy: string | null;
  rejectionNote: string | null;
  incurredAt: string;
  paidAt: string | null;
  createdAt: string;
}

export interface FinancePlanFactRow {
  category: string;
  plan: number;
  actual: number;
  variance: number;
  usagePct: number | null;
}

export interface FinancePlanFact {
  period: string;
  point: string | null;
  plan: number;
  actual: number;
  variance: number;
  usagePct: number | null;
  rows: FinancePlanFactRow[];
}

export interface FinanceBudget {
  id: string;
  period: string;
  category: string;
  point: string | null;
  amount: number;
  version: number;
  idempotent: boolean;
}

export type FinanceSettlementSourceType = 'provider_payment' | 'pos_shift' | 'courier_cod' | 'refund';
export type FinanceSettlementStatus = 'balanced' | 'disputed' | 'closed';

export interface FinanceSettlementSource {
  sourceType: FinanceSettlementSourceType;
  sourceRef: string;
  label: string;
  expectedAmount: number;
  suggestedActualAmount: number;
  point: string | null;
  occurredAt: string;
}

export interface FinanceSettlementLine {
  id: string;
  sourceType: FinanceSettlementSourceType;
  sourceRef: string;
  label: string;
  expectedAmount: number;
  actualAmount: number;
  adjustmentAmount: number;
  variance: number;
  status: 'matched' | 'disputed' | 'reconciled';
  reason: string | null;
  resolutionReason: string | null;
}

export interface FinanceSettlementRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  point: string;
  status: FinanceSettlementStatus;
  expectedTotal: number;
  actualTotal: number;
  adjustmentTotal: number;
  variance: number;
  note: string | null;
  lines: FinanceSettlementLine[];
  createdAt: string;
  closedAt: string | null;
  idempotent?: boolean;
}

export const fetchExpenses = (accessToken: string) => getJson<Expense[]>('/finance/expenses', accessToken);

export const createExpense = (
  input: { idempotencyKey: string; category: string; description: string; amount: number; point?: string },
  accessToken: string,
) => postAuthJson<Expense>('/finance/expenses', input, accessToken);

export const approveExpense = (id: string, accessToken: string) =>
  postAuthJson<Expense>(`/finance/expenses/${encodeURIComponent(id)}/approve`, {}, accessToken);

export const rejectExpense = (id: string, note: string, accessToken: string) =>
  postAuthJson<Expense>(`/finance/expenses/${encodeURIComponent(id)}/reject`, { note }, accessToken);

export const payExpense = (id: string, accessToken: string) =>
  postAuthJson<Expense>(`/finance/expenses/${encodeURIComponent(id)}/pay`, { idempotencyKey: crypto.randomUUID() }, accessToken);

export const fetchFinancePlanFact = (period: string, point: string, accessToken: string) => {
  const query = new URLSearchParams({ period });
  if (point.trim()) query.set('point', point.trim());
  return getJson<FinancePlanFact>(`/finance/plan-fact?${query.toString()}`, accessToken);
};

export const setFinanceBudget = (
  input: { period: string; category: string; amount: number; point?: string },
  accessToken: string,
) => postAuthJson<FinanceBudget>('/finance/budgets', { ...input, idempotencyKey: crypto.randomUUID() }, accessToken);

function settlementQuery(from: string, to: string, point: string) {
  const query = new URLSearchParams({ from: new Date(`${from}T00:00:00.000Z`).toISOString(), to: new Date(`${to}T00:00:00.000Z`).toISOString() });
  if (point.trim()) query.set('point', point.trim());
  return query.toString();
}

export const fetchFinanceSettlementSources = (from: string, to: string, point: string, accessToken: string) =>
  getJson<FinanceSettlementSource[]>(`/finance/settlement-sources?${settlementQuery(from, to, point)}`, accessToken);

export const fetchFinanceSettlements = (accessToken: string) =>
  getJson<FinanceSettlementRun[]>('/finance/settlements', accessToken);

export const createFinanceSettlement = (
  input: { from: string; to: string; point?: string; note?: string; entries: Array<{ sourceType: FinanceSettlementSourceType; sourceRef: string; actualAmount: number; reason?: string }> },
  accessToken: string,
  idempotencyKey: string,
) => postAuthJson<FinanceSettlementRun>('/finance/settlements', {
  ...input,
  from: new Date(`${input.from}T00:00:00.000Z`).toISOString(),
  to: new Date(`${input.to}T00:00:00.000Z`).toISOString(),
  idempotencyKey,
}, accessToken);

export const resolveFinanceSettlement = (runId: string, lineId: string, adjustmentAmount: number, reason: string, accessToken: string, idempotencyKey: string) =>
  postAuthJson<FinanceSettlementRun>(`/finance/settlements/${encodeURIComponent(runId)}/resolve`, { idempotencyKey, lineId, adjustmentAmount, reason }, accessToken);

export const closeFinanceSettlement = (runId: string, accessToken: string, idempotencyKey: string) =>
  postAuthJson<FinanceSettlementRun>(`/finance/settlements/${encodeURIComponent(runId)}/close`, { idempotencyKey }, accessToken);
