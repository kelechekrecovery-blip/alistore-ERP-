import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  OrderCancellationFaultParty,
  OrderCancellationResolutionAction,
} from '@prisma/client';

export class ResolveOrderCancellationDto {
  @ApiProperty({ enum: OrderCancellationResolutionAction })
  @IsEnum(OrderCancellationResolutionAction)
  action!: OrderCancellationResolutionAction;

  @ApiPropertyOptional({ minimum: 0, description: 'Required for approve_partial; ignored for reject.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  refundAmount?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  supplierExpenseAmount?: number;

  @ApiPropertyOptional({ enum: OrderCancellationFaultParty })
  @IsOptional()
  @IsEnum(OrderCancellationFaultParty)
  faultParty?: OrderCancellationFaultParty;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  ownerReason!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 20,
    description: 'EvidenceUpload ids bound to this order.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  evidenceIds?: string[];

  @ApiProperty({ example: '123456', description: 'One-time TOTP step-up code.' })
  @IsString()
  @MinLength(6)
  @MaxLength(12)
  totpToken!: string;
}
