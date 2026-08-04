import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDebtDto {
  @ApiProperty({ example: 'clx_order_001', description: 'Order sold on credit' })
  @IsString() orderId!: string;

  @ApiProperty({ minimum: 1, example: 35000, description: 'Debt principal (сом)' })
  @IsInt() @Min(1) principal!: number;

  @ApiPropertyOptional({ minimum: 1, example: 3, description: 'Number of installments' })
  @IsOptional() @IsInt() @Min(1) installments?: number;

  @ApiPropertyOptional({ minimum: 1, example: 30, description: 'Term in days (due date)' })
  @IsOptional() @IsInt() @Min(1) termDays?: number;

  @ApiPropertyOptional({ example: 'постоянный клиент' })
  @IsOptional() @IsString() reason?: string;

  @ApiPropertyOptional({ example: 'debt-order-2026-001' })
  @IsOptional() @IsString() @MaxLength(128) idempotencyKey?: string;

  @ApiPropertyOptional({ example: 'senior_seller' })
  @IsOptional() @IsString() actor?: string;
}

export const DEBT_PAYMENT_METHODS = ['cash', 'card', 'qr_mbank', 'qr_odengi'] as const;

export class DebtPaymentDto {
  @ApiProperty({ minimum: 1, example: 12000, description: 'Payment amount (сом)' })
  @IsInt() @Min(1) amount!: number;

  /**
   * Метод был захардкожен как `installment` со счётом 1000 «Наличные в кассе»:
   * погашение картой всё равно ложилось на наличные, а наличное погашение не
   * попадало в кассовую смену. Теперь способ оплаты указывается явно.
   */
  @ApiPropertyOptional({ enum: DEBT_PAYMENT_METHODS, example: 'cash', default: 'cash' })
  @IsOptional() @IsIn(DEBT_PAYMENT_METHODS) method?: (typeof DEBT_PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ example: 'debt-payment-2026-001' })
  @IsOptional() @IsString() @MaxLength(128) idempotencyKey?: string;

  @ApiPropertyOptional({ example: 'cashier_01' })
  @IsOptional() @IsString() actor?: string;
}
