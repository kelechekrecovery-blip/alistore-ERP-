import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRefundDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  shiftId?: string;
}

export class CancelRefundDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
