import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceGrade } from './valuation';

export class AssessDto {
  @ApiPropertyOptional({ example: 189900, description: 'Цена нового аналога (сом). Либо sku.' })
  @IsOptional() @IsInt() @Min(1) basePrice?: number;

  @ApiPropertyOptional({ example: 'MBP-14-M3', description: 'SKU — цена нового возьмётся из каталога.' })
  @IsOptional() @IsString() sku?: string;

  @ApiProperty({ enum: ['A', 'B', 'C'], example: 'B' })
  @IsIn(['A', 'B', 'C']) grade!: DeviceGrade;

  @ApiPropertyOptional({ minimum: 0, example: 8, description: 'Возраст в месяцах' })
  @IsOptional() @IsInt() @Min(0) ageMonths?: number;

  @ApiPropertyOptional({ type: [String], example: ['battery'], description: 'screen|battery|body|water|camera' })
  @IsOptional() @IsArray() @IsString({ each: true }) defects?: string[];
}
