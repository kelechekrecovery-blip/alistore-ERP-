import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRefundDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  shiftId?: string;
}

export class CancelRefundDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ResolveRefundDto {
  /** confirm — provider executed the refund; cancel — provider did not. */
  @IsIn(['confirm', 'cancel'])
  action!: 'confirm' | 'cancel';

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  /** Provider statement/payment-reference the operator verified the fact against. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  providerReference?: string;
}
