import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
