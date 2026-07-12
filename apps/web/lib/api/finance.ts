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
