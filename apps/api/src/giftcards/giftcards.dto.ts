import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class IssueGiftCardDto {
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
