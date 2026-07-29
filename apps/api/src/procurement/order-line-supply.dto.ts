import { IsInt, IsISO8601, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';

export class PlaceOrderLineSupplyDto {
  @IsString() @MaxLength(64) supplierId!: string;
  @IsInt() @Min(0) unitCost!: number;
  /** Optional override; defaults to `Product.supplyLeadDays` days from now. */
  @IsOptional() @IsISO8601() expectedAt?: string;
}

export class CancelOrderLineSupplyDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) reason?: string;
}
