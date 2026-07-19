import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const ONLINE_PAYMENT_METHODS = [
  PaymentMethod.card,
  PaymentMethod.qr_mbank,
  PaymentMethod.qr_odengi,
  PaymentMethod.installment,
] as const;

export class CreatePaymentIntentDto {
  @ApiProperty({ example: 'clx_order_001' })
  @IsString()
  orderId!: string;

  @ApiProperty({ enum: ONLINE_PAYMENT_METHODS, example: PaymentMethod.qr_mbank })
  @IsIn(ONLINE_PAYMENT_METHODS)
  method!: (typeof ONLINE_PAYMENT_METHODS)[number];

  @ApiProperty({ minimum: 1, example: 109900 })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: 'https://ali.kg/account/orders/clx_order_001' })
  @IsOptional()
  @IsString()
  returnUrl?: string;

  @ApiPropertyOptional({ example: 'web_checkout' })
  @IsOptional()
  @IsString()
  actor?: string;
}

export class PaymentWebhookDto {
  @ApiProperty({ enum: ONLINE_PAYMENT_METHODS, example: PaymentMethod.qr_mbank })
  @IsIn(ONLINE_PAYMENT_METHODS)
  method!: (typeof ONLINE_PAYMENT_METHODS)[number];

  @ApiProperty({ example: 'clx_order_001' })
  @IsString()
  orderId!: string;

  @ApiProperty({ minimum: 1, example: 109900 })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ example: 'mbank-clx_order_001-20260707162000' })
  @IsString()
  txnId!: string;

  @ApiProperty({ enum: ['succeeded', 'failed'], example: 'succeeded' })
  @IsIn(['succeeded', 'failed'])
  status!: 'succeeded' | 'failed';

  @ApiPropertyOptional({ example: 'sandbox' })
  @IsOptional()
  @IsString()
  actor?: string;
}
