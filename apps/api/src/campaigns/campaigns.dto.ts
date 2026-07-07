import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CAMPAIGN_CHANNELS = ['sms', 'push', 'telegram'] as const;

export class SegmentRulesDto {
  @ApiPropertyOptional({ example: 'gold', description: 'Customer.segments tag for loyalty level' })
  @IsOptional() @IsString() level?: string;

  @ApiPropertyOptional({ example: 'Бишкек', description: 'Matches Customer.segments city:<value> or raw value' })
  @IsOptional() @IsString() city?: string;

  @ApiPropertyOptional({ example: ['iphone'], type: [String] })
  @IsOptional() @IsString({ each: true }) tags?: string[];

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minSpent?: number;

  @ApiPropertyOptional({ example: 200000 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxSpent?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minLtv?: number;

  @ApiPropertyOptional({ example: 200000 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxLtv?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class CreateCampaignDto extends SegmentRulesDto {
  @ApiProperty({ enum: CAMPAIGN_CHANNELS, example: 'sms' })
  @IsIn(CAMPAIGN_CHANNELS as unknown as string[]) channel!: (typeof CAMPAIGN_CHANNELS)[number];

  @ApiProperty({ example: 10000 })
  @Type(() => Number) @IsInt() @Min(0) budget!: number;

  @ApiPropertyOptional({ example: 'campaign_offer' })
  @IsOptional() @IsString() template?: string;

  @ApiPropertyOptional({ example: 'Скидка 10% на аксессуары до воскресенья' })
  @IsOptional() @IsString() message?: string;
}

export class CampaignConversionDto {
  @ApiProperty({ example: 'clx_order_001' })
  @IsString() orderId!: string;
}
