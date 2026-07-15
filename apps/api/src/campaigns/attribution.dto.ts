import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttributionTouchDto {
  @ApiProperty({ example: 'instagram' })
  @IsString() @MaxLength(80) source!: string;

  @ApiPropertyOptional({ example: 'paid_social' })
  @IsOptional() @IsString() @MaxLength(80) medium?: string;

  @ApiPropertyOptional({ example: 'cmp_7P4M2K9Q' })
  @IsOptional() @IsString() @MaxLength(120) campaign?: string;

  @ApiPropertyOptional({ example: 'summer-hero-a' })
  @IsOptional() @IsString() @MaxLength(120) content?: string;

  @ApiPropertyOptional({ example: 'iphone bishkek' })
  @IsOptional() @IsString() @MaxLength(120) term?: string;

  @ApiPropertyOptional({ example: '/catalog?category=phones' })
  @IsOptional() @IsString() @MaxLength(500) landing?: string;
}

export class OrderAttributionDto {
  @ApiProperty({ type: AttributionTouchDto })
  @ValidateNested() @Type(() => AttributionTouchDto) first!: AttributionTouchDto;

  @ApiProperty({ type: AttributionTouchDto })
  @ValidateNested() @Type(() => AttributionTouchDto) last!: AttributionTouchDto;
}
