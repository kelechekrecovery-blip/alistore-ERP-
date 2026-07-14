import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

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
}

export class FinancePeriodQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period!: string;
  @IsOptional() @IsString() @MaxLength(100) point?: string;
}

export class SetFinanceBudgetDto extends FinancePeriodQueryDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsIn(EXPENSE_CATEGORIES) category!: (typeof EXPENSE_CATEGORIES)[number];
  @IsInt() @Min(1) amount!: number;
}
