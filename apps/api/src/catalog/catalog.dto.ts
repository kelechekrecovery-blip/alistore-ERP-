import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
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

  @ApiPropertyOptional({ enum: ['name', 'price_asc', 'price_desc', 'stock_desc'], default: 'name' })
  @IsOptional()
  @IsIn(['name', 'price_asc', 'price_desc', 'stock_desc'])
  sort?: 'name' | 'price_asc' | 'price_desc' | 'stock_desc';

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

export class InstallmentStepDto {
  @ApiProperty({ example: 12 }) months!: number;
  @ApiProperty({ example: 2075, description: 'Наименьший платёж на этой ступени, сом.' }) monthlySom!: number;
  @ApiProperty({ example: ['O!Market', 'ZERO'], description: 'Где эту ступень оформить.' }) providers!: string[];
}

export class InstallmentOfferDto {
  @ApiProperty({ example: 'omarket' }) id!: string;
  @ApiProperty({ example: 'O!Market' }) label!: string;
  @ApiProperty({ example: 12 }) months!: number;
  @ApiProperty({ example: 2075, description: 'Ежемесячный платёж, сом.' }) monthlySom!: number;
  @ApiProperty({ example: 24900, description: 'Итого к выплате: цена плюс наценка магазина.' }) totalSom!: number;
}

export class InstallmentProviderDto {
  @ApiProperty({ example: 'omarket' }) id!: string;
  @ApiProperty({ example: 'O!Market' }) label!: string;
  @ApiProperty({ example: '/media/qr-omarket.png', description: 'QR магазина, загруженный владельцем в ERP.' }) qrUrl!: string;
}

export class CatalogProductDto {
  /**
   * Лучшая партнёрская рассрочка для этой цены — «от N сом/мес» на карточке.
   * `null` — рассрочка недоступна или все провайдеры выключены в настройках.
   * Считает сервер: витрина не имеет права придумывать финансовое условие.
   */
  @ApiPropertyOptional({ type: () => InstallmentOfferDto, nullable: true })
  installment?: InstallmentOfferDto | null;

  /**
   * Ступени срока — «12 мес — X, 6 мес — Y, 3 мес — Z», одна строка на срок.
   * Карточке каталога хватает лучшего платежа, а карточке товара нужна вилка:
   * покупатель выбирает срок, а провайдеры перечислены внутри ступени — они
   * важны ему только тем, где подписывать.
   */
  @ApiPropertyOptional({ type: () => [InstallmentStepDto] })
  installmentSteps?: InstallmentStepDto[];

  /**
   * Где оформить рассрочку: провайдер и его QR из ERP.
   *
   * Публичного API у партнёров нет — рассрочку оформляют в магазине по QR,
   * который банк выдал этой точке. Поле отсутствует, пока владелец не загрузил
   * ни одного кода: показывать «оформите по QR» без самого QR бессмысленно.
   */
  @ApiPropertyOptional({ type: () => [InstallmentProviderDto] })
  installmentProviders?: InstallmentProviderDto[];

  /**
   * Сколько бонусов начислит покупка этого товара.
   *
   * Считается той же функцией, что и реальное начисление в заказе
   * (`customers/loyalty-ledger.ts loyaltyEarnAmount`), — обещание на витрине
   * обязано совпасть с тем, что покупатель потом получит.
   */
  @ApiPropertyOptional({ example: 249 })
  bonusPoints?: number;

  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiPropertyOptional({ nullable: true }) barcode!: string | null;
  @ApiPropertyOptional({ nullable: true }) variantGroup!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 109900 }) price!: number;
  @ApiProperty({ example: 'phones' }) category!: string;
  @ApiProperty({ enum: ['serialized', 'quantity'] }) trackingMode!: 'serialized' | 'quantity';
  @ApiProperty({ enum: ['own_stock', 'to_order'] }) supplyMode!: 'own_stock' | 'to_order';
  @ApiPropertyOptional({ nullable: true, example: 7 }) supplyLeadDays!: number | null;
  @ApiProperty() orderable!: boolean;
  @ApiProperty({ enum: ['in_stock', 'to_order', 'unavailable'] })
  availabilityKind!: 'in_stock' | 'to_order' | 'unavailable';
  @ApiPropertyOptional({ nullable: true, example: 7 }) leadTimeDays!: number | null;
  @ApiPropertyOptional({ nullable: true, example: '2026-08-05' })
  estimatedDeliveryDate!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) attrs!: Prisma.JsonValue;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  bundleComponents!: Array<{ productId: string; sku: string; name: string; qty: number }>;
  @ApiProperty({ example: 3 }) availableUnits!: number;
  @ApiProperty({ example: 8 }) reviewCount!: number;
  @ApiPropertyOptional({ nullable: true, example: 4.8 }) avgRating!: number | null;
  @ApiProperty({ example: '2026-07-08T09:30:00.000Z' }) updatedAt!: string;
}

export class CatalogProductDetailDto {
  @ApiProperty({ type: () => CatalogProductDto }) product!: CatalogProductDto;
  @ApiProperty({ type: () => [CatalogProductDto] }) variants!: CatalogProductDto[];
  @ApiProperty({ type: () => [CatalogProductDto] }) related!: CatalogProductDto[];
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
