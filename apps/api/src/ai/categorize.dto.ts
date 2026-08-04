import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategorizeDto {
  @ApiProperty({ example: 'iPhone 15 128GB', description: 'Название товара' })
  @IsString() name!: string;

  @ApiPropertyOptional({ description: 'Атрибуты товара (строковые значения учитываются)' })
  @IsOptional() @IsObject() attrs?: Record<string, unknown>;
}
