export declare const EXPENSE_CATEGORIES: readonly ["rent", "payroll", "logistics", "marketing", "utilities", "procurement", "other"];
export declare class CreateExpenseDto {
    idempotencyKey: string;
    category: (typeof EXPENSE_CATEGORIES)[number];
    description: string;
    amount: number;
    currency?: string;
    exchangeRateId?: string;
    taxMode?: 'none' | 'included' | 'excluded';
    taxRateBps?: number;
    point?: string;
    supplierId?: string;
    incurredAt?: string;
}
export declare class CurrencyRateQueryDto {
    currency?: string;
    asOf?: string;
}
export declare class FxExposureQueryDto {
    currency?: string;
    point?: string;
    asOf?: string;
}
export declare class CreateCurrencyRateDto {
    idempotencyKey: string;
    currency: string;
    rateMicros: number;
    effectiveAt: string;
    source: string;
}
export declare class RejectExpenseDto {
    note: string;
}
export declare class PayExpenseDto {
    idempotencyKey: string;
    fundingAccountCode: '1000' | '1010' | '1020';
    paymentReference?: string;
}
export declare class FinanceAccountingQueryDto {
    from: string;
    to: string;
    point?: string;
    accountCode?: string;
    sourceType?: string;
}
export declare class ReverseAccountingEntryDto {
    idempotencyKey: string;
    reason: string;
    occurredAt?: string;
}
export declare class ManualAdjustmentLineDto {
    accountCode: string;
    debit?: number;
    credit?: number;
    memo?: string;
}
export declare class CreateManualAdjustmentDto {
    idempotencyKey: string;
    documentNumber: string;
    description: string;
    point?: string;
    occurredAt: string;
    lines: ManualAdjustmentLineDto[];
}
export declare class FinancePeriodQueryDto {
    period: string;
    point?: string;
}
export declare class SupplierAgingQueryDto {
    asOf?: string;
    supplierId?: string;
}
export declare class ArAgingQueryDto {
    asOf?: string;
    customerId?: string;
    status?: 'open' | 'settled';
}
export declare class BankStatementLineDto {
    externalId: string;
    occurredAt: string;
    amount: number;
    reference?: string;
}
export declare class ImportBankStatementDto {
    idempotencyKey: string;
    statementNumber: string;
    accountCode: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: number;
    closingBalance: number;
    lines: BankStatementLineDto[];
}
export declare class ReconcileBankStatementLineDto {
    idempotencyKey: string;
    journalEntryId: string;
}
export declare class CreateCashIncassationDto {
    amount: number;
    destinationCode?: string;
    reference?: string;
}
export declare class CloseAccountingPeriodDto {
    idempotencyKey: string;
    status: 'soft_closed' | 'hard_closed';
}
export declare class CreateOpeningBalanceLineDto {
    accountCode: string;
    debit: number;
    credit: number;
    memo?: string;
}
export declare class CreateOpeningBalanceDto {
    idempotencyKey: string;
    period: string;
    documentNumber: string;
    description: string;
    lines: CreateOpeningBalanceLineDto[];
}
export declare class CreateFixedAssetDto {
    idempotencyKey: string;
    assetNumber: string;
    name: string;
    category: string;
    serialNumber?: string;
    acquisitionCost: number;
    usefulLifeMonths: number;
    acquiredAt: string;
    inServiceAt?: string;
    fundingAccountCode?: '1000' | '1010' | '1020';
    externalRef?: string;
}
export declare class DepreciateFixedAssetDto {
    idempotencyKey: string;
    period: string;
}
export declare const ACCOUNTABLE_ADVANCE_EXPENSE_ACCOUNTS: readonly ["6200", "6300", "6400", "6500", "6600", "6900"];
export declare class AccountableAdvanceQueryDto {
    staffId?: string;
    status?: 'open' | 'partially_settled' | 'settled';
}
export declare class CreateAccountableAdvanceDto {
    idempotencyKey: string;
    staffId: string;
    amount: number;
    purpose: string;
    point?: string;
    dueAt?: string;
    fundingAccountCode: '1000' | '1010' | '1020';
    paymentReference: string;
}
export declare class SettleAccountableAdvanceDto {
    idempotencyKey: string;
    amount: number;
    expenseAccountCode: (typeof ACCOUNTABLE_ADVANCE_EXPENSE_ACCOUNTS)[number];
    description: string;
}
export declare class CloseAccountableAdvanceDto {
    idempotencyKey: string;
    amount: number;
    fundingAccountCode: '1000' | '1010' | '1020';
    paymentReference: string;
}
export declare class SettleTaxPeriodDto {
    idempotencyKey: string;
    point?: string;
}
export declare class SetFinanceBudgetDto extends FinancePeriodQueryDto {
    idempotencyKey: string;
    category: (typeof EXPENSE_CATEGORIES)[number];
    amount: number;
}
export declare const SETTLEMENT_SOURCE_TYPES: readonly ["provider_payment", "pos_shift", "courier_cod", "refund"];
export declare class FinanceSettlementQueryDto {
    from: string;
    to: string;
    point?: string;
}
export declare class FinanceSettlementEntryDto {
    sourceType: (typeof SETTLEMENT_SOURCE_TYPES)[number];
    sourceRef: string;
    actualAmount: number;
    reason?: string;
}
export declare class CreateFinanceSettlementDto extends FinanceSettlementQueryDto {
    idempotencyKey: string;
    note?: string;
    entries: FinanceSettlementEntryDto[];
}
export declare class ResolveFinanceSettlementDto {
    idempotencyKey: string;
    lineId: string;
    adjustmentAmount: number;
    reason: string;
}
export declare class CloseFinanceSettlementDto {
    idempotencyKey: string;
}
