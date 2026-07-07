import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Grade } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTradeInDto {
  @ApiProperty({ example: 'clx_customer_001' })
  @IsString()
  customerId!: string;

  @ApiProperty({ example: 'iPhone 13 Pro 256GB' })
  @IsString()
  model!: string;

  @ApiProperty({ enum: Grade, example: Grade.B })
  @IsEnum(Grade)
  grade!: Grade;

  @ApiProperty({ minimum: 1, example: 42000 })
  @IsInt()
  @Min(1)
  price!: number;

  @ApiProperty({
    description: 'Seller passport or national id. Stored for anti-fraud, masked in responses.',
    example: 'ID1234567',
  })
  @IsString()
  sellerPassport!: string;

  @ApiPropertyOptional({ example: 'seller_azamat' })
  @IsOptional()
  @IsString()
  actor?: string;
}

export class TradeInViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ enum: Grade })
  grade!: Grade;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  contractId!: string | null;

  @ApiProperty({ example: 'ID1***67' })
  sellerPassportMasked!: string;
}
