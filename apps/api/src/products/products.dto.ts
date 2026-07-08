import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export class ProductListQueryDto {
  @ApiPropertyOptional({ description: 'Search by SKU, name, or category.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: false, description: 'Include archived products.' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value))
  includeArchived?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit = 50;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset = 0;
}

export class CreateProductDto {
  @ApiProperty({ example: 'IPHONE-15-128-BLK' })
  @IsString()
  @MaxLength(80)
  sku!: string;

  @ApiProperty({ example: 'iPhone 15 128GB Black' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ minimum: 0, example: 109900, description: 'Initial price (сом)' })
  @IsInt()
  @Min(0)
  price!: number;

  @ApiProperty({ minimum: 0, example: 92000, description: 'Cost (сом)' })
  @IsInt()
  @Min(0)
  cost!: number;

  @ApiProperty({ example: 'phones' })
  @IsString()
  @MaxLength(80)
  category!: string;

  @ApiPropertyOptional({ type: 'object', example: { storage: '128GB', color: 'black' } })
  @IsOptional()
  @IsObject()
  attrs?: Record<string, unknown>;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'iPhone 15 128GB Black' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ minimum: 0, example: 92000, description: 'Cost (сом)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 'phones' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ type: 'object', example: { storage: '128GB', color: 'black' } })
  @IsOptional()
  @IsObject()
  attrs?: Record<string, unknown>;
}

export class ChangePriceDto {
  @ApiProperty({ minimum: 0, example: 119900, description: 'New price (сом)' })
  @IsInt() @Min(0) price!: number;

  @ApiProperty({ example: 'подорожание у поставщика' })
  @IsString() reason!: string;

  @ApiPropertyOptional({ example: 'senior_seller_azamat' })
  @IsOptional() @IsString() requester?: string;
}

export class DeleteProductDto {
  @ApiProperty({ example: 'снят с продажи' })
  @IsString() reason!: string;

  @ApiPropertyOptional({ example: 'owner' })
  @IsOptional() @IsString() requester?: string;
}

export class CreateProductReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt() @Min(1) @Max(5) rating!: number;

  @ApiPropertyOptional({ example: 'Быстро доставили, устройство как новое.' })
  @IsOptional() @IsString() @MaxLength(500) text?: string;

  @ApiPropertyOptional({ description: 'Specific paid/completed order to attach the review to.' })
  @IsOptional() @IsString() orderId?: string;
}
