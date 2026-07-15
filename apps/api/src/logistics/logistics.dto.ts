import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateDeliveryZoneDto {
  @ApiProperty({ example: 'center' }) @IsString() @MaxLength(40) code!: string;
  @ApiProperty({ example: 'Центр' }) @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ example: 0, minimum: 0 }) @IsInt() @Min(0) fee!: number;
  @ApiProperty({ example: 60, minimum: 1 }) @IsInt() @Min(1) etaMinMinutes!: number;
  @ApiProperty({ example: 120, minimum: 1 }) @IsInt() @Min(1) etaMaxMinutes!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateDeliverySlotDto {
  @ApiProperty() @IsString() zoneId!: string;
  @ApiProperty() @IsISO8601() startsAt!: string;
  @ApiProperty() @IsISO8601() endsAt!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) capacity!: number;
}

export class LogisticsDateQueryDto {
  @ApiPropertyOptional({ example: '2026-07-15' }) @IsOptional() @IsISO8601({ strict: true }) date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
}

export class CreateStorePointDto {
  @ApiProperty({ example: 'center' })
  @IsString() @Matches(/^[a-z0-9-]+$/) @MaxLength(40)
  code!: string;

  @ApiProperty({ example: 'AliStore Центр' })
  @IsString() @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Бишкек, ул. Киевская 95' })
  @IsString() @MaxLength(240)
  address!: string;

  @ApiProperty({ example: 'BISHKEK-1' })
  @IsString() @Matches(/^[A-Z0-9-]+$/) @MaxLength(80)
  inventoryLocation!: string;

  @ApiProperty({ example: 'Ежедневно 10:00–21:00' })
  @IsString() @MaxLength(120)
  hours!: string;

  @ApiPropertyOptional({ example: 'Назовите код выдачи сотруднику' })
  @IsOptional() @IsString() @MaxLength(240)
  pickupInstructions?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ default: 100, minimum: 0, maximum: 10000 })
  @IsOptional() @IsInt() @Min(0) @Max(10_000)
  sortOrder?: number;
}

export class UpdateStorePointDto {
  @ApiPropertyOptional({ example: 'AliStore Центр' })
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Бишкек, ул. Киевская 95' })
  @IsOptional() @IsString() @MaxLength(240)
  address?: string;

  @ApiPropertyOptional({ example: 'Ежедневно 10:00–21:00' })
  @IsOptional() @IsString() @MaxLength(120)
  hours?: string;

  @ApiPropertyOptional({ example: 'Назовите код выдачи сотруднику' })
  @IsOptional() @IsString() @MaxLength(240)
  pickupInstructions?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 10000 })
  @IsOptional() @IsInt() @Min(0) @Max(10_000)
  sortOrder?: number;
}
