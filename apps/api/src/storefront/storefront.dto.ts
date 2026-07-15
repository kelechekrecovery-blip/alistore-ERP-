import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsISO8601, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StorefrontBenefitDto {
  @ApiProperty() @IsString() @MaxLength(80) title!: string;
  @ApiProperty() @IsString() @MaxLength(180) body!: string;
}

export class CreateStorefrontContentDto {
  @ApiProperty() @IsString() @MaxLength(60) heroEyebrow!: string;
  @ApiProperty() @IsString() @MaxLength(120) heroTitle!: string;
  @ApiProperty() @IsString() @MaxLength(260) heroBody!: string;
  @ApiProperty() @IsString() @MaxLength(40) heroCtaLabel!: string;
  @ApiProperty() @IsString() @MaxLength(240) heroCtaHref!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) heroImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) financingText?: string;
  @ApiProperty() @IsString() @MaxLength(120) aboutTitle!: string;
  @ApiProperty() @IsString() @MaxLength(4000) aboutBody!: string;
  @ApiProperty() @IsString() @MaxLength(120) deliveryTitle!: string;
  @ApiProperty() @IsString() @MaxLength(4000) deliveryBody!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) supportHours?: string;
  @ApiProperty({ type: () => [StorefrontBenefitDto] })
  @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => StorefrontBenefitDto)
  benefits!: StorefrontBenefitDto[];
  @ApiProperty() @IsString() @MaxLength(100) featuredTitle!: string;
  @ApiProperty({ type: [String], maxItems: 12 })
  @IsArray() @ArrayMaxSize(12) @ArrayUnique() @IsString({ each: true })
  featuredProductIds!: string[];
}

export class ScheduleStorefrontContentDto {
  @ApiProperty() @IsISO8601() startsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() endsAt?: string;
}
