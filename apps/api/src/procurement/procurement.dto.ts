import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PurchaseOrderLineDto {
  @IsString() @MaxLength(64) productId!: string;
  @IsInt() @Min(1) qty!: number;
  @IsInt() @Min(0) unitCost!: number;
}

export class CreatePurchaseOrderDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsString() @MaxLength(64) supplierId!: string;
  @IsString() @MaxLength(100) @Matches(/\S/, { message: 'location must contain a non-whitespace character' }) location!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PurchaseOrderLineDto)
  items!: PurchaseOrderLineDto[];
}

export class ReceivePurchaseOrderLineDto {
  @IsString() @MaxLength(64) itemId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ArrayUnique() @IsString({ each: true }) @MaxLength(64, { each: true }) imeis!: string[];
  @IsOptional() @IsIn(['A', 'B', 'C']) grade?: 'A' | 'B' | 'C';
}

export class ReceivePurchaseOrderDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ReceivePurchaseOrderLineDto)
  lines!: ReceivePurchaseOrderLineDto[];
}
