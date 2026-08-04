import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ReplaceSupplierOfferDto {
  @IsString()
  @MaxLength(64)
  supplierId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierSku?: string;

  @IsInt()
  @Min(0)
  unitCost!: number;

  @IsInt()
  @Min(0)
  availableQty!: number;

  @IsInt()
  @Min(1)
  @Max(180)
  leadDays!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  validForHours?: number;
}
