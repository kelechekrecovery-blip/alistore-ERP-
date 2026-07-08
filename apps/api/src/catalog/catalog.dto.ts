import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export class CatalogSearchQueryDto {
  @ApiPropertyOptional({
    description: 'Search text matched against product name, SKU, and category.',
    example: 'iphone 15',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'phones' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'When true, returns only products with at least one in-stock unit.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value))
  stockOnly?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit = 24;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset = 0;
}

export class CatalogProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 109900 }) price!: number;
  @ApiProperty({ example: 'phones' }) category!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) attrs!: Prisma.JsonValue;
  @ApiProperty({ example: 3 }) availableUnits!: number;
  @ApiProperty({ example: '2026-07-08T09:30:00.000Z' }) updatedAt!: string;
}

export class CatalogSearchResponseDto {
  @ApiProperty({ enum: ['postgres', 'meilisearch', 'postgres_fallback'] })
  source!: 'postgres' | 'meilisearch' | 'postgres_fallback';

  @ApiPropertyOptional({
    description: 'Present when Meilisearch was configured but the API used Postgres fallback.',
  })
  warning?: string;

  @ApiProperty({ example: 12 }) total!: number;
  @ApiProperty({ example: 24 }) limit!: number;
  @ApiProperty({ example: 0 }) offset!: number;
  @ApiProperty({ type: () => [CatalogProductDto] }) items!: CatalogProductDto[];
}

export class CatalogReindexResponseDto {
  @ApiProperty({ enum: ['meilisearch'] }) source!: 'meilisearch';
  @ApiProperty({ example: 'products' }) index!: string;
  @ApiProperty({ example: 42 }) indexed!: number;
  @ApiPropertyOptional({ example: 123 }) taskUid?: number | string;
}

export class CatalogDeltaQueryDto {
  @ApiPropertyOptional({
    description: 'ISO cursor returned by a previous delta response.',
    example: '2026-07-08T09:30:00.000Z',
  })
  @IsOptional()
  @IsString()
  since?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit = 500;
}

export class CatalogDeltaResponseDto {
  @ApiProperty({ example: '2026-07-08T09:31:00.000Z' }) cursor!: string;
  @ApiPropertyOptional({ example: '2026-07-08T09:30:00.000Z' }) since?: string;
  @ApiProperty({ type: () => [CatalogProductDto] }) changed!: CatalogProductDto[];
  @ApiProperty({ type: () => [String], example: ['clx_archived_product'] }) removed!: string[];
  @ApiProperty({ example: 2 }) totalChanged!: number;
  @ApiProperty({ example: 1 }) totalRemoved!: number;
  @ApiProperty({ example: false }) truncated!: boolean;
}
