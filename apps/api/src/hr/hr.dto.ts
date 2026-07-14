import { HrAbsenceStatus, HrAbsenceType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class HrWeekQueryDto {
  @ApiProperty({ example: '2026-07-13' })
  @IsISO8601({ strict: true }) weekStart!: string;

  @ApiPropertyOptional({ example: 'Bishkek / ЦУМ' })
  @IsOptional() @IsString() @MaxLength(120) point?: string;
}

export class CreateHrScheduleDto {
  @ApiProperty() @IsString() staffId!: string;
  @ApiProperty() @IsString() @MaxLength(120) point!: string;
  @ApiProperty({ example: '2026-07-15' }) @IsISO8601({ strict: true }) shiftDate!: string;
  @ApiProperty({ example: '2026-07-15T03:00:00.000Z' }) @IsISO8601() startsAt!: string;
  @ApiProperty({ example: '2026-07-15T15:00:00.000Z' }) @IsISO8601() endsAt!: string;
}

export class OpenHrAttendanceDto {
  @ApiProperty() @IsString() scheduleId!: string;
}

export class RequestHrAbsenceDto {
  @ApiProperty({ enum: HrAbsenceType }) @IsEnum(HrAbsenceType) type!: HrAbsenceType;
  @ApiProperty({ example: '2026-07-20' }) @IsISO8601({ strict: true }) startsOn!: string;
  @ApiProperty({ example: '2026-07-24' }) @IsISO8601({ strict: true }) endsOn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class DecideHrAbsenceDto {
  @ApiProperty({ enum: [HrAbsenceStatus.approved, HrAbsenceStatus.rejected] })
  @IsEnum(HrAbsenceStatus) status!: HrAbsenceStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
