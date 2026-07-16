import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Grade } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTradeInDto {
  @ApiPropertyOptional({
    description: 'Required for guest capability and staff intake. Ignored for customer JWT requests.',
    example: 'clx_customer_001',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ example: 'iPhone 13 Pro 256GB' })
  @IsString()
  model!: string;

  @ApiPropertyOptional({ description: 'Device IMEI or serial captured during intake.', example: '359-DUP-1' })
  @IsOptional()
  @IsString()
  imei?: string;

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

}

export class TradeInViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ nullable: true })
  imei!: string | null;

  @ApiProperty({ enum: Grade })
  grade!: Grade;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  contractId!: string | null;

  @ApiProperty({ example: 'ID1***67' })
  sellerPassportMasked!: string;
}
