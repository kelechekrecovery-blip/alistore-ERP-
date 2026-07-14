import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateServiceWorkOrderDto {
  @ApiProperty()
  @IsString()
  warrantyCaseId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  technicianId?: string;
}

export class DiagnoseServiceWorkOrderDto {
  @ApiProperty({ example: 'Требуется замена аккумулятора' })
  @IsString()
  @MaxLength(2000)
  summary!: string;

  @ApiProperty({ example: 4500, description: 'Полная смета в сомах' })
  @IsInt()
  @Min(0)
  estimateAmount!: number;

  @ApiPropertyOptional({ example: 500, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  diagnosticFee?: number;
}
