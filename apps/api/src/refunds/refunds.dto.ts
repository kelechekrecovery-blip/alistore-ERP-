import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRefundDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  /**
   * Смена, из которой выдаются наличные (только для наличного возврата).
   * Необязателен: при пустом значении берётся единственная открытая смена
   * исполнителя на точке платежа. Передавайте явно, если открытых смен несколько.
   */
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

/**
 * Кто выдаёт наличные при повторном исполнении возврата. F-17: смена инициатора
 * могла закрыться, пока заявка ждала одобрения, — тогда выплату закрывает своей
 * сменой тот, кто реально отдаёт деньги.
 */
export class RetryRefundDto {
  @IsOptional()
  @IsString()
  shiftId?: string;
}
