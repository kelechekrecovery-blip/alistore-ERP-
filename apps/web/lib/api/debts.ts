import { getJson, postAuthJson } from './http';

/** Debt/installment plan as returned by GET /debts and POST /debts (within the limit). */
export interface DebtPlan {
  id: string;
  orderId: string;
  customerId: string;
  principal: number;
  balance: number;
  installments: number;
  status: 'open' | 'settled' | 'written_off';
  dueDate: string;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Over the booking limit the API parks the debt as an approval request instead. */
export interface DebtApprovalRequest {
  id: string;
  action: string;
  status: string;
  reason?: string;
}

export type CreateDebtResult = DebtPlan | DebtApprovalRequest;

/** The create endpoint returns 202 with an approval request when the limit is exceeded. */
export function isDebtApproval(result: CreateDebtResult): result is DebtApprovalRequest {
  return (result as DebtApprovalRequest).action === 'debt';
}

export function fetchDebts(
  filter: { customerId?: string; status?: string },
  accessToken: string,
): Promise<DebtPlan[]> {
  const params = new URLSearchParams();
  if (filter.customerId) params.set('customerId', filter.customerId);
  if (filter.status) params.set('status', filter.status);
  const qs = params.toString();
  return getJson(`/debts${qs ? `?${qs}` : ''}`, accessToken);
}

export function createDebt(input: {
  orderId: string;
  principal: number;
  installments?: number;
  termDays?: number;
  reason?: string;
  idempotencyKey?: string;
}, accessToken: string): Promise<CreateDebtResult> {
  return postAuthJson('/debts', input, accessToken);
}

export interface DebtPaymentResult {
  debt: DebtPlan;
  paymentId: string;
  settled: boolean;
  idempotent: boolean;
}

export function payDebt(
  id: string,
  input: { amount: number; idempotencyKey?: string },
  accessToken: string,
): Promise<DebtPaymentResult> {
  return postAuthJson(`/debts/${encodeURIComponent(id)}/payments`, input, accessToken);
}
