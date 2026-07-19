import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CAMPAIGN_CHANNELS = ['sms', 'push', 'telegram', 'whatsapp'] as const;
export const CAMPAIGN_CREATIVE_TYPES = ['text', 'image', 'video'] as const;

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
  @ApiPropertyOptional({ example: 'VIP аксессуары · июль' })
  @IsOptional() @IsString() @MaxLength(120) name?: string;

  @ApiProperty({ enum: CAMPAIGN_CHANNELS, example: 'sms' })
  @IsIn(CAMPAIGN_CHANNELS as unknown as string[]) channel!: (typeof CAMPAIGN_CHANNELS)[number];

  @ApiProperty({ example: 10000 })
  @Type(() => Number) @IsInt() @Min(0) budget!: number;

  @ApiProperty({ example: 'VIP-предложение AliStore' })
  @IsString() @MaxLength(120) creativeHeadline!: string;

  @ApiPropertyOptional({ enum: CAMPAIGN_CREATIVE_TYPES, example: 'image' })
  @IsOptional() @IsIn(CAMPAIGN_CREATIVE_TYPES as unknown as string[])
  creativeType?: (typeof CAMPAIGN_CREATIVE_TYPES)[number];

  @ApiPropertyOptional({ example: 'Скидка 10% на аксессуары до воскресенья' })
  @IsOptional() @IsString() @MaxLength(1000) creativeBody?: string;

  @ApiPropertyOptional({ example: 'https://media.ali.kg/campaigns/vip.jpg' })
  @IsOptional() @IsString() @MaxLength(500) creativeAssetUrl?: string;

  @ApiPropertyOptional({ example: 'Смотреть предложение' })
  @IsOptional() @IsString() @MaxLength(80) creativeCtaLabel?: string;

  @ApiPropertyOptional({ example: '/catalog?category=accessories' })
  @IsOptional() @IsString() @MaxLength(300) destinationUrl?: string;

  @ApiPropertyOptional({ example: 'alistore_crm' })
  @IsOptional() @IsString() @MaxLength(80) source?: string;

  @ApiPropertyOptional({ example: 'whatsapp' })
  @IsOptional() @IsString() @MaxLength(80) medium?: string;

  @ApiPropertyOptional({ example: 'VIP10' })
  @IsOptional() @IsString() @MaxLength(64) promotionCode?: string;

  @ApiPropertyOptional({ example: 'campaign_offer' })
  @IsOptional() @IsString() @MaxLength(120) template?: string;
}

export class UpdateCampaignDto extends SegmentRulesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional({ enum: CAMPAIGN_CHANNELS })
  @IsOptional() @IsIn(CAMPAIGN_CHANNELS as unknown as string[]) channel?: (typeof CAMPAIGN_CHANNELS)[number];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) budget?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) creativeHeadline?: string;
  @ApiPropertyOptional({ enum: CAMPAIGN_CREATIVE_TYPES })
  @IsOptional() @IsIn(CAMPAIGN_CREATIVE_TYPES as unknown as string[]) creativeType?: (typeof CAMPAIGN_CREATIVE_TYPES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) creativeBody?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) creativeAssetUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) creativeCtaLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) destinationUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) source?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) medium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) promotionCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) template?: string;
}

export class RecordCampaignSpendDto {
  @ApiProperty({ example: '145f3322-377e-4ec2-b3fb-bc4db254735d' })
  @IsUUID() idempotencyKey!: string;

  @ApiProperty({ example: 'meta_ads' })
  @IsString() @MaxLength(80) provider!: string;

  @ApiProperty({ example: 'invoice-2026-07-15-001' })
  @IsString() @MaxLength(160) externalRef!: string;

  @ApiProperty({ example: 2500 })
  @Type(() => Number) @IsInt() @Min(1) amount!: number;

  @ApiProperty({ example: '2026-07-15T08:00:00.000Z' })
  @IsISO8601() occurredAt!: string;
}

export class CampaignConversionDto {
  @ApiProperty({ example: 'clx_order_001' })
  @IsString() orderId!: string;
}
