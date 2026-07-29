import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Multipart form fields alongside the uploaded file. `mapping` travels as a
 * JSON string (multipart fields are always strings) and is parsed + validated
 * in the service; omitted → the supplier's last stored mapping is reused.
 */
export class CreateSupplierPriceImportDto {
  @ApiProperty({ description: 'Supplier this price list belongs to' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  supplierId!: string;

  @ApiPropertyOptional({
    description:
      'JSON {sku, price, leadDays?, barcode?} — column headers as they appear in row 1. Omit to reuse the last mapping stored for this supplier.',
  })
  @IsOptional()
  @IsString()
  mapping?: string;
}
