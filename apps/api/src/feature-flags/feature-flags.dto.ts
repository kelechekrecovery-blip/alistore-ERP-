import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FEATURE_FLAG_KEYS } from './feature-flags.registry';

const trimString = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class FeatureFlagReasonDto {
  @ApiProperty({ example: 'Pause rollout while checkout alerts are investigated', maxLength: 500 })
  @Transform(trimString)
  @IsString()
  @Matches(/\S/, { message: 'reason must contain a non-whitespace character' })
  @MaxLength(500)
  reason!: string;
}

export class SetFeatureFlagDto extends FeatureFlagReasonDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}

export class FeatureFlagStateDto {
  @ApiProperty({ enum: FEATURE_FLAG_KEYS, example: 'supply.to_order_checkout' })
  key!: string;

  @ApiProperty({ example: 'Allow checkout for products fulfilled through the to-order supply flow.' })
  description!: string;

  @ApiProperty({ example: 'commerce' })
  owner!: string;

  @ApiProperty({ example: false, default: false })
  defaultEnabled!: false;

  @ApiProperty({ example: 'TO_ORDER_CHECKOUT_ENABLED' })
  legacyEnv!: string;

  @ApiProperty({ example: false })
  enabled!: boolean;

  @ApiProperty({ enum: ['database', 'environment', 'default'], example: 'default' })
  source!: 'database' | 'environment' | 'default';
}
