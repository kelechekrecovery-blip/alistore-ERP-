import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PayDto {
  @ApiProperty({ example: 'clx_order_001' })
  @IsString() orderId!: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.cash })
  @IsEnum(PaymentMethod) method!: PaymentMethod;

  @ApiProperty({ minimum: 1, example: 109900 })
  @IsInt() @Min(1) amount!: number;

  /** Present on webhook-driven payments; used for txn-level idempotency (dedup). */
  @ApiPropertyOptional({
    description: 'External transaction id used to deduplicate webhook retries.',
    example: 'mbank-20260706-0001',
  })
  @IsOptional() @IsString() txnId?: string;

  /** Cash shift to attribute this payment to — drives drawer reconciliation. */
  @ApiPropertyOptional({
    description: 'Open cash shift the payment belongs to (POS drawer reconciliation).',
    example: 'clx_shift_001',
  })
  @IsOptional() @IsString() shiftId?: string;

  /** Required when method=gift_card; code is normalized server-side. */
  @ApiPropertyOptional({
    description: 'Gift-card/store-credit code required for method=gift_card.',
    example: 'GC-ALISTORE-2026',
  })
  @IsOptional() @IsString() giftCardCode?: string;
}

export class RefundAllocationDto {
  @ApiProperty({ example: 'clx_payment_001', description: 'Positive original tender to reverse.' })
  @IsString() paymentId!: string;

  @ApiProperty({ minimum: 1, example: 40000 })
  @IsInt() @Min(1) amount!: number;

  @ApiPropertyOptional({ example: 'clx_shift_001', description: 'Requester-owned open shift for this cash allocation.' })
  @IsOptional() @IsString() shiftId?: string;

  @ApiPropertyOptional({ example: 'acquirer-refund-card-001', description: 'Unique provider/bank reference for this non-cash allocation.' })
  @IsOptional() @IsString() externalReference?: string;
}

export class RefundDto {
  @ApiProperty({ minimum: 1, example: 109900, description: 'Total refund amount across all original tenders.' })
  @IsInt() @Min(1) amount!: number;

  @ApiProperty({ example: 'брак, возврат по акту' })
  @IsString() reason!: string;

  @ApiPropertyOptional({ example: 'senior_seller_azamat' })
  @IsOptional() @IsString() requester?: string;

  @ApiPropertyOptional({ example: 'clx_return_001', description: 'Approved return this refund settles.' })
  @IsOptional() @IsString() returnId?: string;

  @ApiPropertyOptional({ example: 'clx_shift_001', description: 'Open requester-owned shift used for a cash payout.' })
  @IsOptional() @IsString() shiftId?: string;

  @ApiPropertyOptional({ example: 'acquirer-refund-001', description: 'Provider/bank refund reference for non-cash tenders.' })
  @IsOptional() @IsString() externalReference?: string;

  @ApiPropertyOptional({
    type: [RefundAllocationDto],
    description: 'Explicit same-order tender allocations. Omit for a legacy single-tender refund.',
  })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RefundAllocationDto)
  allocations?: RefundAllocationDto[];
}

export class VoidPaymentDto {
  @ApiProperty({ example: 'payment_intent_expired', description: 'Why the unfinished payment is being cancelled.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
