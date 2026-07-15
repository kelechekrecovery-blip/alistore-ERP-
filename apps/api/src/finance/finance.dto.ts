import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

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
  @IsInt() @Min(1) amount!: number;
  @IsOptional() @IsString() @MaxLength(100) point?: string;
  @IsOptional() @IsString() @MaxLength(64) supplierId?: string;
  @IsOptional() @IsISO8601({ strict: true }) incurredAt?: string;
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

export class FinancePeriodQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period!: string;
  @IsOptional() @IsString() @MaxLength(100) point?: string;
}

export class CloseAccountingPeriodDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsIn(['soft_closed', 'hard_closed']) status!: 'soft_closed' | 'hard_closed';
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
