import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExchangeDto {
  @ApiProperty({ example: 'clx_order_001', description: 'Order the old device was sold on' })
  @IsString() originalOrderId!: string;

  @ApiProperty({ example: 'IPH-15-128-UNIT-1', description: 'IMEI being returned' })
  @IsString() oldImei!: string;

  @ApiProperty({ example: 'clx_product_002', description: 'Product to exchange into' })
  @IsString() newProductId!: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.cash, description: 'Method for the surcharge' })
  @IsEnum(PaymentMethod) method!: PaymentMethod;

  @ApiPropertyOptional({ example: 'senior_seller_azamat' })
  @IsOptional() @IsString() requester?: string;
}
