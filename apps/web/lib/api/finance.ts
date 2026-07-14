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
