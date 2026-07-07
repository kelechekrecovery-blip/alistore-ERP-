import { IsObject, IsOptional, IsString } from 'class-validator';

/** Describe a product by SKU, or inline by name/category/attrs. */
export class DescribeDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsObject()
  attrs?: Record<string, unknown>;
}
