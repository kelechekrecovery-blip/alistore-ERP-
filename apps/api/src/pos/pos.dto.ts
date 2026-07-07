import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PosLineDto {
  @ApiProperty({ example: 'clx_product_001' })
  @IsString() productId!: string;

  @ApiProperty({ example: 'IPH-15-128' })
  @IsString() sku!: string;

  @ApiProperty({ minimum: 0, example: 109900 })
  @IsInt() @Min(0) price!: number;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt() @Min(1) qty!: number;
}

export class PosSaleDto {
  @ApiProperty({ example: 'staff_seller_01' })
  @IsString() staffId!: string;

  @ApiProperty({ example: 'BISHKEK-1' })
  @IsString() point!: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.cash })
  @IsEnum(PaymentMethod) method!: PaymentMethod;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, example: 10, description: 'Discount %' })
  @IsOptional() @IsInt() @Min(0) @Max(100) discountPct?: number;

  @ApiPropertyOptional({ description: 'Approved discount/margin approvalId — required to complete a gated sale' })
  @IsOptional() @IsString() approvalId?: string;

  @ApiPropertyOptional({ example: 'постоянный клиент, акция' })
  @IsOptional() @IsString() reason?: string;

  @ApiPropertyOptional({
    description: 'Client-generated sale id for offline POS retry idempotency.',
    example: 'pos_20260707_0001',
  })
  @IsOptional() @IsString() clientSaleId?: string;

  @ApiProperty({ type: () => [PosLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosLineDto)
  lines!: PosLineDto[];
}
