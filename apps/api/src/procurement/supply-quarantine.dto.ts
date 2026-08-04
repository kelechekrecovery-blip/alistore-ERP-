import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SupplyQuarantineDisposition } from '@prisma/client';

export class ProposeSupplyQuarantineDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsObject()
  evidence!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  imeis?: string[];
}

export class ResolveSupplyQuarantineDto {
  @IsEnum(SupplyQuarantineDisposition)
  disposition!: SupplyQuarantineDisposition;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsObject()
  evidence!: Record<string, unknown>;
}
