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
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { OrderAttributionDto } from '../campaigns/attribution.dto';

const CHANNELS = ['web', 'app', 'mobile', 'staff_mobile', 'pos', 'telegram'] as const;
const FULFILLMENT_TYPES = ['pickup', 'courier', 'express', 'store'] as const;

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

  @ApiPropertyOptional({ enum: FULFILLMENT_TYPES, example: 'pickup' })
  @IsOptional()
  @IsIn(FULFILLMENT_TYPES)
  fulfillmentType?: (typeof FULFILLMENT_TYPES)[number];

  @ApiPropertyOptional({ description: 'Server-managed active store/pickup point id.' })
  @IsOptional()
  @IsString()
  storePointId?: string;

  @ApiPropertyOptional({ example: 'alistore-center' })
  @IsOptional()
  @IsString()
  pickupPoint?: string;

  @ApiPropertyOptional({ example: 'Бишкек, ул. Киевская 95' })
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional({ example: 'today 16:00-18:00' })
  @IsOptional()
  @IsString()
  deliverySlot?: string;

  @ApiPropertyOptional({ description: 'Server-managed delivery zone id.' })
  @IsOptional()
  @IsString()
  deliveryZoneId?: string;

  @ApiPropertyOptional({ description: 'Server-managed delivery slot id.' })
  @IsOptional()
  @IsString()
  deliverySlotId?: string;

  @ApiProperty({ minimum: 0, example: 109900 })
  @IsInt() @Min(0) total!: number;

  @ApiPropertyOptional({ example: 'SALE5000' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiPropertyOptional({ type: OrderAttributionDto, description: 'First/last marketing touch captured by the storefront.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderAttributionDto)
  attribution?: OrderAttributionDto;

  @ApiPropertyOptional({ minimum: 0, example: 4820, description: 'Authenticated checkout only; validated against the server ledger.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  loyaltyPoints?: number;

  @ApiProperty({ type: () => [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

/** Customer identity is always derived from JWT on `/orders/mine`. */
export class CreateMyOrderDto extends OmitType(CreateOrderDto, ['customerId'] as const) {}

export class TransitionDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.paid })
  @IsEnum(OrderStatus) to!: OrderStatus;
}
