import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export const EXPENSE_CATEGORIES = [
  'rent',
  'payroll',
  'logistics',
  'marketing',
  'utilities',
  'procurement',
  'other',
] as const;

export class CreateExpenseDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsIn(EXPENSE_CATEGORIES) category!: (typeof EXPENSE_CATEGORIES)[number];
  @IsString() @MinLength(2) @MaxLength(500) @Matches(/\S/) description!: string;
  @IsInt() @Min(1) @Max(2147483647) amount!: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(64) exchangeRateId?: string;
  @IsOptional() @IsIn(['none', 'included', 'excluded']) taxMode?: 'none' | 'included' | 'excluded';
  @IsOptional() @IsInt() @Min(0) @Max(10000) taxRateBps?: number;
  @IsOptional() @IsString() @MaxLength(100) point?: string;
  @IsOptional() @IsString() @MaxLength(64) supplierId?: string;
  @IsOptional() @IsISO8601({ strict: true }) incurredAt?: string;
}

export class CurrencyRateQueryDto {
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsISO8601({ strict: true }) asOf?: string;
}

export class CreateCurrencyRateDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsInt() @Min(1) @Max(2147483647) rateMicros!: number;
  @IsISO8601({ strict: true }) effectiveAt!: string;
  @IsString() @MinLength(2) @MaxLength(128) @Matches(/\S/) source!: string;
}

export class RejectExpenseDto {
  @IsString() @MinLength(2) @MaxLength(500) @Matches(/\S/) note!: string;
}

export class PayExpenseDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsIn(['1000', '1010', '1020']) fundingAccountCode!: '1000' | '1010' | '1020';
  @IsOptional() @IsString() @MaxLength(128) paymentReference?: string;
}

export class FinanceAccountingQueryDto {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
  @IsOptional() @IsString() @MaxLength(100) point?: string;
  @IsOptional() @IsString() @MaxLength(32) accountCode?: string;
  @IsOptional() @IsString() @MaxLength(64) sourceType?: string;
}

export class ReverseAccountingEntryDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsISO8601({ strict: true }) occurredAt?: string;
}

export class FinancePeriodQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period!: string;
  @IsOptional() @IsString() @MaxLength(100) point?: string;
}

export class SupplierAgingQueryDto {
  @IsOptional() @IsISO8601({ strict: true }) asOf?: string;
  @IsOptional() @IsString() @MaxLength(64) supplierId?: string;
}

export class ArAgingQueryDto {
  @IsOptional() @IsISO8601({ strict: true }) asOf?: string;
  @IsOptional() @IsString() @MaxLength(64) customerId?: string;
  @IsOptional() @IsIn(['open', 'settled']) status?: 'open' | 'settled';
}

export class BankStatementLineDto {
  @IsString() @MinLength(1) @MaxLength(128) externalId!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsInt() amount!: number;
  @IsOptional() @IsString() @MaxLength(500) reference?: string;
}

export class ImportBankStatementDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsString() @MinLength(1) @MaxLength(64) statementNumber!: string;
  @IsString() @MaxLength(32) accountCode!: string;
  @IsISO8601({ strict: true }) periodStart!: string;
  @IsISO8601({ strict: true }) periodEnd!: string;
  @IsInt() openingBalance!: number;
  @IsInt() closingBalance!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10_000) @ValidateNested({ each: true }) @Type(() => BankStatementLineDto)
  lines!: BankStatementLineDto[];
}

export class ReconcileBankStatementLineDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsString() @MinLength(1) @MaxLength(64) journalEntryId!: string;
}

export class CreateCashIncassationDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CloseAccountingPeriodDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsIn(['soft_closed', 'hard_closed']) status!: 'soft_closed' | 'hard_closed';
}

export class CreateOpeningBalanceLineDto {
  @IsString() @Matches(/^\d{4}$/) accountCode!: string;
  @IsInt() @Min(0) @Max(2147483647) debit!: number;
  @IsInt() @Min(0) @Max(2147483647) credit!: number;
  @IsOptional() @IsString() @MaxLength(240) memo?: string;
}

export class CreateOpeningBalanceDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period!: string;
  @IsString() @MinLength(1) @MaxLength(128) @Matches(/\S/) documentNumber!: string;
  @IsString() @MinLength(3) @MaxLength(500) @Matches(/\S/) description!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => CreateOpeningBalanceLineDto)
  lines!: CreateOpeningBalanceLineDto[];
}

export class CreateFixedAssetDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsString() @MinLength(1) @MaxLength(64) @Matches(/\S/) assetNumber!: string;
  @IsString() @MinLength(2) @MaxLength(200) @Matches(/\S/) name!: string;
  @IsString() @MinLength(2) @MaxLength(100) @Matches(/\S/) category!: string;
  @IsOptional() @IsString() @MaxLength(128) serialNumber?: string;
  @IsInt() @Min(1) @Max(2147483647) acquisitionCost!: number;
  @IsInt() @Min(1) @Max(600) usefulLifeMonths!: number;
  @IsISO8601({ strict: true }) acquiredAt!: string;
  @IsOptional() @IsISO8601({ strict: true }) inServiceAt?: string;
  @IsOptional() @IsIn(['1000', '1010', '1020']) fundingAccountCode?: '1000' | '1010' | '1020';
  @IsOptional() @IsString() @MaxLength(160) externalRef?: string;
}

export class DepreciateFixedAssetDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period!: string;
}

export const ACCOUNTABLE_ADVANCE_EXPENSE_ACCOUNTS = ['6200', '6300', '6400', '6500', '6600', '6900'] as const;

export class AccountableAdvanceQueryDto {
  @IsOptional() @IsString() @MaxLength(64) staffId?: string;
  @IsOptional() @IsIn(['open', 'partially_settled', 'settled']) status?: 'open' | 'partially_settled' | 'settled';
}

export class CreateAccountableAdvanceDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsString() @MinLength(1) @MaxLength(64) staffId!: string;
  @IsInt() @Min(1) @Max(2147483647) amount!: number;
  @IsString() @MinLength(3) @MaxLength(500) @Matches(/\S/) purpose!: string;
  @IsOptional() @IsString() @MaxLength(120) point?: string;
  @IsOptional() @IsISO8601({ strict: true }) dueAt?: string;
  @IsIn(['1000', '1010', '1020']) fundingAccountCode!: '1000' | '1010' | '1020';
  @IsString() @MinLength(1) @MaxLength(160) @Matches(/\S/) paymentReference!: string;
}

export class SettleAccountableAdvanceDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsInt() @Min(1) @Max(2147483647) amount!: number;
  @IsIn(ACCOUNTABLE_ADVANCE_EXPENSE_ACCOUNTS) expenseAccountCode!: (typeof ACCOUNTABLE_ADVANCE_EXPENSE_ACCOUNTS)[number];
  @IsString() @MinLength(3) @MaxLength(500) @Matches(/\S/) description!: string;
}

export class CloseAccountableAdvanceDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsInt() @Min(1) @Max(2147483647) amount!: number;
  @IsIn(['1000', '1010', '1020']) fundingAccountCode!: '1000' | '1010' | '1020';
  @IsString() @MinLength(1) @MaxLength(160) @Matches(/\S/) paymentReference!: string;
}

export class SettleTaxPeriodDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(100) point?: string;
}

export class SetFinanceBudgetDto extends FinancePeriodQueryDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsIn(EXPENSE_CATEGORIES) category!: (typeof EXPENSE_CATEGORIES)[number];
  @IsInt() @Min(1) amount!: number;
}

export const SETTLEMENT_SOURCE_TYPES = ['provider_payment', 'pos_shift', 'courier_cod', 'refund'] as const;

export class FinanceSettlementQueryDto {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
  @IsOptional() @IsString() @MaxLength(100) point?: string;
}

export class FinanceSettlementEntryDto {
  @IsIn(SETTLEMENT_SOURCE_TYPES) sourceType!: (typeof SETTLEMENT_SOURCE_TYPES)[number];
  @IsString() @MinLength(1) @MaxLength(128) sourceRef!: string;
  @IsInt() actualAmount!: number;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(500) @Matches(/\S/) reason?: string;
}

export class CreateFinanceSettlementDto extends FinanceSettlementQueryDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FinanceSettlementEntryDto)
  entries!: FinanceSettlementEntryDto[];
}

export class ResolveFinanceSettlementDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsString() @MinLength(1) @MaxLength(128) lineId!: string;
  @IsInt() adjustmentAmount!: number;
  @IsString() @MinLength(2) @MaxLength(500) @Matches(/\S/) reason!: string;
}

export class CloseFinanceSettlementDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
}
