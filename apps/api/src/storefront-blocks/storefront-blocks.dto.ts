import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StorefrontBlockDevice, StorefrontBlockType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateStorefrontBlockDto {
  @ApiProperty({ enum: StorefrontBlockType }) @IsEnum(StorefrontBlockType) type!: StorefrontBlockType;
  @ApiPropertyOptional({ enum: StorefrontBlockDevice }) @IsOptional() @IsEnum(StorefrontBlockDevice) device?: StorefrontBlockDevice;
  @ApiProperty() @IsString() @MaxLength(120) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) eyebrow?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) body?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) ctaLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) ctaHref?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @ApiPropertyOptional({ enum: ['dark', 'coral', 'light', 'lime'] })
  @IsOptional() @IsIn(['dark', 'coral', 'light', 'lime']) tone?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ArrayUnique() @IsString({ each: true }) productIds?: string[];
}

export class UpdateStorefrontBlockDto {
  @ApiPropertyOptional({ enum: StorefrontBlockType }) @IsOptional() @IsEnum(StorefrontBlockType) type?: StorefrontBlockType;
  @ApiPropertyOptional({ enum: StorefrontBlockDevice }) @IsOptional() @IsEnum(StorefrontBlockDevice) device?: StorefrontBlockDevice;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) eyebrow?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) body?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) ctaLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) ctaHref?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @ApiPropertyOptional({ enum: ['dark', 'coral', 'light', 'lime'] })
  @IsOptional() @IsIn(['dark', 'coral', 'light', 'lime']) tone?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ArrayUnique() @IsString({ each: true }) productIds?: string[];
}

export class ScheduleStorefrontBlockDto {
  @ApiProperty() @IsISO8601() startsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() endsAt?: string;
}

export class ReorderStorefrontBlocksDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) ids!: string[];
}
