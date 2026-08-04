import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const PLAN_TYPES = ['accidental_damage', 'extended_warranty', 'full_protection'] as const;
const COVERAGE_MONTHS = [12, 24] as const;
const STAFF_STATUSES = ['reviewing', 'offered', 'rejected'] as const;

export class RequestProtectionDto {
  @ApiProperty({ example: '356789012345678' })
  @IsString()
  @MaxLength(80)
  imei!: string;

  @ApiProperty({ enum: PLAN_TYPES, example: 'full_protection' })
  @IsIn(PLAN_TYPES)
  planType!: (typeof PLAN_TYPES)[number];

  @ApiProperty({ enum: COVERAGE_MONTHS, example: 12 })
  @IsInt()
  @IsIn(COVERAGE_MONTHS)
  coverageMonths!: (typeof COVERAGE_MONTHS)[number];
}

export class UpdateProtectionDto {
  @ApiProperty({ enum: STAFF_STATUSES, example: 'offered' })
  @IsIn(STAFF_STATUSES)
  status!: (typeof STAFF_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 0, example: 8500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  premium?: number;

  @ApiPropertyOptional({ example: 'Покрытие после дистанционной диагностики' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  staffNote?: string;
}
