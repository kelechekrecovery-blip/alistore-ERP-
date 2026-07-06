import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

const CHANNELS = ['web', 'app', 'pos', 'telegram'] as const;

export class OrderItemDto {
  @IsString() sku!: string;
  @IsInt() @Min(1) qty!: number;
  @IsInt() @Min(0) price!: number;
  /** Set for serialised goods (phones, laptops) tracked by IMEI/SN. */
  @IsOptional() @IsString() imei?: string;
}

export class CreateOrderDto {
  @IsString() customerId!: string;
  @IsIn(CHANNELS) channel!: (typeof CHANNELS)[number];
  @IsInt() @Min(0) total!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

export class TransitionDto {
  @IsString() to!: OrderStatus;
}
