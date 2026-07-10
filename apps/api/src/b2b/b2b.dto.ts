import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PAYMENT_INTENTS = ['invoice', 'bank_transfer'] as const;
const FULFILLMENT_TYPES = ['delivery', 'pickup'] as const;
const STAFF_STATUSES = ['reviewing', 'quoted', 'rejected'] as const;
const QUOTE_STATUSES = ['requested', ...STAFF_STATUSES, 'accepted'] as const;

export class UpsertBusinessProfileDto {
  @ApiProperty({ example: 'ОсОО Техно Плюс' })
  @IsString()
  @Length(2, 160)
  companyName!: string;

  @ApiProperty({ example: '12345678901234' })
  @IsString()
  @Length(8, 20)
  taxId!: string;

  @ApiProperty({ example: 'Айбек Садыков' })
  @IsString()
  @Length(2, 120)
  contactName!: string;

  @ApiPropertyOptional({ example: 'procurement@example.kg' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Бишкек, ул. Киевская 95' })
  @IsString()
  @Length(5, 240)
  billingAddress!: string;
}

export class B2BQuoteItemDto {
  @ApiProperty({ example: 'IPHONE-15-128-BLK' })
  @IsString()
  @MaxLength(80)
  sku!: string;

  @ApiProperty({ minimum: 1, example: 10 })
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ minimum: 0, example: 95000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetPrice?: number;
}

export class CreateB2BQuoteDto {
  @ApiProperty({ type: () => [B2BQuoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => B2BQuoteItemDto)
  items!: B2BQuoteItemDto[];

  @ApiProperty({ enum: PAYMENT_INTENTS, example: 'invoice' })
  @IsIn(PAYMENT_INTENTS)
  paymentIntent!: (typeof PAYMENT_INTENTS)[number];

  @ApiProperty({ enum: FULFILLMENT_TYPES, example: 'delivery' })
  @IsIn(FULFILLMENT_TYPES)
  fulfillmentType!: (typeof FULFILLMENT_TYPES)[number];

  @ApiPropertyOptional({ example: 'Бишкек, ул. Киевская 95' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  deliveryAddress?: string;

  @ApiPropertyOptional({ example: 'alistore-center' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pickupPoint?: string;

  @ApiPropertyOptional({ example: 'Нужны устройства до конца месяца' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class UpdateB2BQuoteDto {
  @ApiProperty({ enum: STAFF_STATUSES, example: 'reviewing' })
  @IsIn(STAFF_STATUSES)
  status!: (typeof STAFF_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 0, example: 900000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  quotedTotal?: number;

  @ApiPropertyOptional({ example: 'Цена с доставкой и НДС' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  staffNote?: string;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class ListB2BQuotesQueryDto {
  @ApiPropertyOptional({ enum: QUOTE_STATUSES })
  @IsOptional()
  @IsIn(QUOTE_STATUSES)
  status?: (typeof QUOTE_STATUSES)[number];
}
