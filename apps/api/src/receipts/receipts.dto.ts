import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceiptStoreDto {
  @IsString() name!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
}

export class ReceiptItemDto {
  @IsString() name!: string;
  @IsInt() @Min(1) qty!: number;
  /** Unit price (minor unit not used — KG prices are whole сом). */
  @IsInt() @Min(0) price!: number;
}

export class ReceiptData {
  @ValidateNested() @Type(() => ReceiptStoreDto) store!: ReceiptStoreDto;
  @IsString() orderId!: string;
  /** ISO timestamp of issue. */
  @IsString() issuedAt!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  items!: ReceiptItemDto[];
  @IsInt() @Min(0) total!: number;
  @IsString() payment!: string;
  @IsOptional() @IsString() cashier?: string;
}
