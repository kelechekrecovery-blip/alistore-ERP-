import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

const METHODS: PaymentMethod[] = [
  'cash',
  'card',
  'qr_mbank',
  'qr_odengi',
  'bakai_pos',
  'obank',
  'installment',
];

export class PayDto {
  @IsString() orderId!: string;
  @IsIn(METHODS) method!: PaymentMethod;
  @IsInt() @Min(1) amount!: number;
  /** Present on webhook-driven payments; used for txn-level idempotency (dedup). */
  @IsOptional() @IsString() txnId?: string;
}
