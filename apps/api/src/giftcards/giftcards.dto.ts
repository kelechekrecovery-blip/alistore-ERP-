import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Чем клиент оплатил карту. Счёт 1000 «Наличные в кассе» был захардкожен
 * независимо от способа: покупка картой тоже уходила на наличные, а сама
 * наличность не попадала в кассовую смену.
 */
export const GIFT_CARD_PAYMENT_METHODS = ['cash', 'card', 'qr_mbank', 'qr_odengi'] as const;

export class IssueGiftCardDto {
  @ApiPropertyOptional({ enum: GIFT_CARD_PAYMENT_METHODS, example: 'cash', default: 'cash' })
  @IsOptional()
  @IsIn(GIFT_CARD_PAYMENT_METHODS)
  method?: (typeof GIFT_CARD_PAYMENT_METHODS)[number];

  @ApiProperty({ minimum: 1, example: 50000 })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: 'GC-ALISTORE-2026' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'clx_customer_001' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'Подарочная карта за возврат' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: '2026-12-31T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
