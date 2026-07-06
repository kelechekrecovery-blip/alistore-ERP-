import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
