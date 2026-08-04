import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StaffTaskPriority, StaffTaskStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateStaffTaskDto {
  @ApiProperty({ example: 'Обновить ценники на витрине' })
  @IsString() @MaxLength(200) title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty() @IsString() assigneeId!: string;
  @ApiPropertyOptional({ enum: StaffTaskPriority }) @IsOptional() @IsEnum(StaffTaskPriority) priority?: StaffTaskPriority;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() dueAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) relatedType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) relatedId?: string;
}

export class UpdateMyStaffTaskDto {
  @ApiProperty({ enum: ['in_progress', 'completed'] })
  @IsEnum(StaffTaskStatus) status!: StaffTaskStatus;
}

export class ListStaffTasksDto {
  /** `?status=open,in_progress` — доске нужны сразу несколько колонок. */
  @ApiPropertyOptional({ enum: StaffTaskStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((part) => part.trim()).filter(Boolean) : value))
  @IsEnum(StaffTaskStatus, { each: true })
  status?: StaffTaskStatus[];

  @ApiPropertyOptional() @IsOptional() @IsString() assigneeId?: string;
}
