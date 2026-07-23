import { getAuthBlob, getJson, postAuthJson } from './http';

export type ExpenseStatus = 'submitted' | 'approved' | 'rejected' | 'paid';

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  documentAmount: number;
  currency: string;
  exchangeRateMicros: number;
  exchangeRateId: string | null;
  exchangeRate: AccountingCurrencyRate | null;
  taxMode: 'none' | 'included' | 'excluded';
  taxCode: string;
  taxRateBps: number;
  taxBaseAmount: number;
  taxAmount: number;
  point: string | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  status: ExpenseStatus;
  requestedBy: string;
  approvedBy: string | null;
  rejectionNote: string | null;
  incurredAt: string;
  paidAt: string | null;
  paymentAccountCode: string | null;
  paymentReference: string | null;
  accountingEntryId?: string | null;
  createdAt: string;
}

export interface AccountingCurrencyRate {
  id: string;
  currency: string;
  baseCurrency: string;
  rateMicros: number;
  effectiveAt: string;
  source: string;
  createdBy: string;
  createdAt: string;
  idempotent?: boolean;
}

export interface FxExposureRow {
  id: string;
  description: string;
  status: 'submitted' | 'approved';
  point: string | null;
  supplier: { id: string; name: string } | null;
  incurredAt: string;
  currency: string;
  documentAmount: number;
  originalRateMicros: number;
  originalBaseAmount: number;
  currentRate: { id: string; rateMicros: number; effectiveAt: string; source: string } | null;
  currentBaseAmount: number | null;
  valuationDelta: number | null;
  valuationStatus: 'ready' | 'missing_rate' | 'overflow';
}

export interface FxExposureReport {
  asOf: string;
  baseCurrency: 'KGS';
  reportType: 'open_foreign_expense_documents';
  rows: FxExposureRow[];
  totals: Array<{
    currency: string;
    documentAmount: number;
    originalBaseAmount: number;
    currentBaseAmount: number;
    valuationDelta: number;
    openDocuments: number;
    missingRateDocuments: number;
    overflowDocuments: number;
  }>;
  coverage: { complete: boolean; statuses: string[]; limit: number; truncated: boolean; note: string };
}

export interface AccountingAccount {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  active: boolean;
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountingAccount['type'];
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalance {
  from: string;
  to: string;
  point: string | null;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  coverage: { complete: boolean; sourceTypes: string[]; note: string };
  rows: TrialBalanceRow[];
}

export interface AccountingPeriod {
  id: string;
  period: string;
  status: 'open' | 'soft_closed' | 'hard_closed';
  closedAt: string | null;
}

export interface TaxPeriodReport {
  period: string;
  point: string | null;
  from: string;
  to: string;
  status: AccountingPeriod['status'];
  outputTax: number;
  inputTax: number;
  outputNet: number;
  inputNet: number;
  offsetAmount: number;
  payableAmount: number;
  recoverableAmount: number;
  settlement: null | {
    id: string;
    accountingEntryId: string | null;
    createdAt: string;
    createdBy: string;
  };
  idempotent?: boolean;
}

export interface SupplierAgingReport {
  asOf: string;
  totalOutstanding: number;
  totalCreditReceivable: number;
  totalCreditApplied: number;
  supplierCount: number;
  totals: Record<string, number>;
  rows: Array<{ id: string; invoiceNumber: string; amount: number; outstanding: number; supplier: { id: string; name: string }; status: string; dueDate: string }>;
}

export type ArAgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '90_plus' | 'paid';

export interface ArAgingRow {
  id: string;
  customer: { id: string; name: string };
  order: { id: string; channel: string; total: number; status: string; createdAt: string };
  principal: number;
  balance: number;
  outstanding: number;
  currentBalance: number;
  paidAmount: number;
  installments: number;
  dueDate: string;
  ageDays: number;
  bucket: ArAgingBucket;
  status: 'open' | 'settled';
  accountingEntry: { id: string; sourceType: string; sourceRef: string } | null;
  payments: Array<{ id: string; amount: number; status: string; createdAt: string; receivedBy: string | null; point: string | null; txnId: string | null }>;
}

export interface ArAgingReport {
  asOf: string;
  rows: ArAgingRow[];
  totals: Record<ArAgingBucket, number>;
  totalPrincipal: number;
  totalPaid: number;
  totalOutstanding: number;
  customerCount: number;
}

export interface FinancialStatements {
  from: string;
  to: string;
  source: string;
  entries: number;
  balanced: boolean;
  journal: { debit: number; credit: number };
  profitAndLoss: { revenue: number; expenses: number; netProfit: number };
  balanceSheet: { assets: number; liabilities: number; equity: number; currentPeriodProfit: number; liabilitiesAndEquity: number; balanced: boolean };
  cashFlow: { cashMovement: number };
}

export interface BankStatementSummary {
  id: string;
  statementNumber: string;
  accountCode: string;
  status: 'imported' | 'reconciled' | 'disputed';
  openingBalance: number;
  closingBalance: number;
  lines: Array<{ id: string; status: string; amount: number; externalId: string }>;
}

export interface CashIncassation {
  id: string;
  shiftId: string;
  point: string;
  amount: number;
  /** '1010' — расчётный счёт, '3000' — выемка владельцем (Капитал владельца). */
  destinationCode: string;
  status: 'deposited' | 'reconciled' | 'disputed';
  depositedAt: string;
  accountingEntryId: string | null;
}

export interface CollectableShift {
  id: string;
  point: string;
  closedAt: string | null;
  closeCash: number;
  deposited: number;
  available: number;
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
  input: { idempotencyKey: string; category: string; description: string; amount: number; point?: string; currency?: string; exchangeRateId?: string; taxMode?: 'none' | 'included' | 'excluded'; taxRateBps?: number },
  accessToken: string,
) => postAuthJson<Expense>('/finance/expenses', input, accessToken);

export const approveExpense = (id: string, accessToken: string) =>
  postAuthJson<Expense>(`/finance/expenses/${encodeURIComponent(id)}/approve`, {}, accessToken);

export const rejectExpense = (id: string, note: string, accessToken: string) =>
  postAuthJson<Expense>(`/finance/expenses/${encodeURIComponent(id)}/reject`, { note }, accessToken);

export const payExpense = (id: string, fundingAccountCode: string, paymentReference: string, idempotencyKey: string, accessToken: string) =>
  postAuthJson<Expense>(`/finance/expenses/${encodeURIComponent(id)}/pay`, {
    idempotencyKey, fundingAccountCode,
    ...(paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
  }, accessToken);

export const fetchAccountingAccounts = (accessToken: string) =>
  getJson<AccountingAccount[]>('/finance/accounts', accessToken);

export const fetchAccountingCurrencyRates = (accessToken: string) =>
  getJson<AccountingCurrencyRate[]>('/finance/currency-rates', accessToken);

export const fetchFxExposure = (asOf: string, currency: string, point: string, accessToken: string) => {
  const query = new URLSearchParams();
  if (asOf) query.set('asOf', asOf);
  if (currency.trim()) query.set('currency', currency.trim().toUpperCase());
  if (point.trim()) query.set('point', point.trim());
  return getJson<FxExposureReport>(`/finance/fx-exposure?${query.toString()}`, accessToken);
};

export const createAccountingCurrencyRate = (
  input: { currency: string; rateMicros: number; effectiveAt: string; source: string },
  accessToken: string,
) => postAuthJson<AccountingCurrencyRate>('/finance/currency-rates', { ...input, idempotencyKey: crypto.randomUUID() }, accessToken);

export const fetchAccountingPeriods = (accessToken: string) =>
  getJson<AccountingPeriod[]>('/finance/periods', accessToken);

export const closeAccountingPeriod = (
  period: string,
  status: 'soft_closed' | 'hard_closed',
  accessToken: string,
) => postAuthJson<AccountingPeriod>(`/finance/periods/${encodeURIComponent(period)}/close`, {
  status,
  idempotencyKey: crypto.randomUUID(),
}, accessToken);

export const fetchTaxPeriod = (period: string, point: string, accessToken: string) => {
  const query = new URLSearchParams();
  if (point.trim()) query.set('point', point.trim());
  return getJson<TaxPeriodReport>(`/finance/tax-periods/${encodeURIComponent(period)}${query.size ? `?${query.toString()}` : ''}`, accessToken);
};

export const settleTaxPeriod = (period: string, point: string, accessToken: string) =>
  postAuthJson<TaxPeriodReport>(`/finance/tax-periods/${encodeURIComponent(period)}/settle`, {
    idempotencyKey: crypto.randomUUID(),
    ...(point.trim() ? { point: point.trim() } : {}),
  }, accessToken);

function accountingRange(period: string, point: string) {
  const [year, month] = period.split('-').map(Number);
  const query = new URLSearchParams({
    from: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    to: new Date(Date.UTC(year, month, 1)).toISOString(),
  });
  if (point.trim()) query.set('point', point.trim());
  return query.toString();
}

export const fetchFinancialStatements = (period: string, point: string, accessToken: string) =>
  getJson<FinancialStatements>(`/finance/statements?${accountingRange(period, point)}`, accessToken);

export const fetchSupplierAging = (accessToken: string) =>
  getJson<SupplierAgingReport>('/finance/ap-aging', accessToken);

export const fetchCustomerAging = (asOf: string, accessToken: string) => {
  const query = new URLSearchParams({ asOf: new Date(`${asOf}T23:59:59.999Z`).toISOString() });
  return getJson<ArAgingReport>(`/finance/ar-aging?${query.toString()}`, accessToken);
};

export const downloadAccountingJournal = (period: string, point: string, accessToken: string) =>
  getAuthBlob(`/finance/journal/export?${accountingRange(period, point)}`, accessToken);

export const fetchBankStatements = (accessToken: string) =>
  getJson<BankStatementSummary[]>('/finance/bank-statements', accessToken);

export const fetchCashIncassations = (accessToken: string) =>
  getJson<CashIncassation[]>('/finance/cash-incassations', accessToken);

/** Closed shifts that still hold uncollected cash — the incassation picker. */
export const fetchCollectableShifts = (accessToken: string) =>
  getJson<CollectableShift[]>('/finance/collectable-shifts', accessToken);

export const createCashIncassation = (
  shiftId: string,
  input: { amount: number; destinationCode: '1010' | '3000'; reference?: string },
  idempotencyKey: string,
  accessToken: string,
) => postAuthJson<CashIncassation>(`/finance/cash-incassations/${encodeURIComponent(shiftId)}`, input, accessToken, { 'idempotency-key': idempotencyKey });

export const fetchTrialBalance = (period: string, point: string, accessToken: string) => {
  const [year, month] = period.split('-').map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const to = new Date(Date.UTC(year, month, 1)).toISOString();
  const query = new URLSearchParams({ from, to });
  if (point.trim()) query.set('point', point.trim());
  return getJson<TrialBalance>(`/finance/trial-balance?${query.toString()}`, accessToken);
};

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
