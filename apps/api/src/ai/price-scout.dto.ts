import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarketListingDto {
  @ApiPropertyOptional({ example: 'iPhone 15 Pro 256GB, идеал' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'lalafo' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'used' })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ example: 112000 })
  @IsInt()
  @Min(1)
  price!: number;
}

export class PriceScoutDto {
  @ApiPropertyOptional({ example: 'IPHONE-15-128-BLK', description: 'Existing SKU; catalog price becomes anchor.' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 'iPhone 15 128GB Black' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'phones' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 109900, description: 'Catalog/new-equivalent price when sku is not supplied.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  basePrice?: number;

  @ApiPropertyOptional({
    type: [MarketListingDto],
    description: 'Optional manually collected listings. Keyless scout uses them deterministically.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MarketListingDto)
  observedListings?: MarketListingDto[];
}
