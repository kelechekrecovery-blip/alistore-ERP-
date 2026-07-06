import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const CHANNELS = ['web', 'app', 'pos', 'telegram'] as const;

export class OrderItemDto {
  @ApiProperty({ example: 'IPHONE-15-128-BLK' })
  @IsString() sku!: string;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt() @Min(1) qty!: number;

  @ApiProperty({ minimum: 0, example: 109900 })
  @IsInt() @Min(0) price!: number;

  /** Set for serialised goods (phones, laptops) tracked by IMEI/SN. */
  @ApiPropertyOptional({
    description: 'IMEI/SN for serialized electronics tracked per physical unit.',
    example: '356789012345678',
  })
  @IsOptional() @IsString() imei?: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'clx_customer_001' })
  @IsString() customerId!: string;

  @ApiProperty({ enum: CHANNELS, example: 'web' })
  @IsIn(CHANNELS) channel!: (typeof CHANNELS)[number];

  @ApiProperty({ minimum: 0, example: 109900 })
  @IsInt() @Min(0) total!: number;

  @ApiProperty({ type: () => [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

export class TransitionDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.paid })
  @IsEnum(OrderStatus) to!: OrderStatus;
}
