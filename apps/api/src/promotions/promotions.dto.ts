import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromotionDiscountType } from '@prisma/client';

export class PromotionQuoteItemDto {
  @ApiProperty() @IsString() @MaxLength(100) sku!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(100) qty!: number;
}

export class PromotionQuoteDto {
  @ApiProperty() @IsString() @MaxLength(32) code!: string;
  @ApiProperty({ type: () => [PromotionQuoteItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PromotionQuoteItemDto)
  items!: PromotionQuoteItemDto[];
}

export class CreatePromotionDto {
  @ApiProperty({ example: 'BACK2SCHOOL' })
  @IsString() @Matches(/^[A-Za-z0-9_-]{3,32}$/) code!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty({ enum: PromotionDiscountType }) @IsEnum(PromotionDiscountType) discountType!: PromotionDiscountType;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) discountValue!: number;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) maxDiscount?: number;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0) minimumSubtotal?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) eligibleProductIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsString({ each: true }) eligibleCategories?: string[];
  @ApiPropertyOptional() @IsOptional() @IsISO8601() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() endsAt?: string;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) totalLimit?: number;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) perCustomerLimit?: number;
}

/**
 * Patch DTO kept explicit because the API accepts partial promotion edits.
 * Relying on Swagger's mapped type here makes runtime validation version-sensitive.
 */
export class UpdatePromotionDto {
  @ApiPropertyOptional({ example: 'BACK2SCHOOL' })
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{3,32}$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ enum: PromotionDiscountType })
  @IsOptional() @IsEnum(PromotionDiscountType) discountType?: PromotionDiscountType;
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional() @IsInt() @Min(1) discountValue?: number;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) maxDiscount?: number;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0) minimumSubtotal?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) eligibleProductIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsString({ each: true }) eligibleCategories?: string[];
  @ApiPropertyOptional() @IsOptional() @IsISO8601() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() endsAt?: string;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) totalLimit?: number;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) perCustomerLimit?: number;
}
