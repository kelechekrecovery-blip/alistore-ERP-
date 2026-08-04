import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class CreateServiceWorkOrderDto {
  @ApiProperty()
  @IsString()
  warrantyCaseId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  technicianId?: string;
}

export class DiagnoseServiceWorkOrderDto {
  @ApiProperty({ example: 'Требуется замена аккумулятора' })
  @IsString()
  @MaxLength(2000)
  summary!: string;

  @ApiProperty({ example: 4500, description: 'Полная смета в сомах' })
  @IsInt()
  @Min(0)
  estimateAmount!: number;

  @ApiPropertyOptional({ example: 500, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  diagnosticFee?: number;
}

export class CreatePaidRepairDto {
  @ApiProperty({ example: '+996700000001' })
  @IsString()
  @Matches(/^\+?[0-9]{9,15}$/, { message: 'phone must be 9-15 digits, optional leading +' })
  phone!: string;

  @ApiProperty({ example: 'Айбек' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  customerName!: string;

  @ApiProperty({ example: 'Xiaomi 13' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  deviceName!: string;

  @ApiProperty({ example: 'SN-123456789' })
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  serial!: string;

  @ApiProperty({ example: 'Требуется замена экрана' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  problem!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  technicianId?: string;
}

export class ServicePaymentTenderDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.cash })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ example: 5000 })
  @IsInt()
  @Min(1)
  amount!: number;
}

export class PayServiceWorkOrderDto {
  @ApiProperty({ type: [ServicePaymentTenderDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ServicePaymentTenderDto)
  payments!: ServicePaymentTenderDto[];
}

export class ReserveServicePartDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  qty!: number;
}

export class CompleteServiceRepairDto {
  @ApiProperty({ example: 'Экран заменён, устройство прошло контроль качества' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  summary!: string;
}

export class AssignServiceTechnicianDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  technicianId!: string;
}

export class ReplaceServiceDeviceDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  replacementImei!: string;

  @ApiProperty({ example: 'Устройство заменено после подтверждённого гарантийного случая' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  summary!: string;
}

export class RegisterLoanerDeviceDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  imei!: string;

  @ApiProperty({ example: 'Без повреждений, аккумулятор 92%' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  condition!: string;
}

export class PrepareLoanerLoanDto {
  @ApiProperty()
  @IsString()
  loanerDeviceId!: string;

  @ApiProperty({ example: '2026-07-20T12:00:00.000Z' })
  @IsDateString()
  dueAt!: string;

  @ApiProperty({ example: 'Без повреждений, комплект с кабелем' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  issueCondition!: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  depositAmount?: number;

  @ApiPropertyOptional({ example: 'LN-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  agreementRef?: string;
}

export class ReturnLoanerLoanDto {
  @ApiProperty({ example: 'Возвращено в исправном состоянии' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  returnCondition!: string;

  @ApiPropertyOptional({ example: 'Царапина на рамке' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  damageNote?: string;
}

export class ResolveLoanerDisputeDto {
  @ApiProperty({ enum: ['available', 'written_off'] })
  @IsIn(['available', 'written_off'])
  disposition!: 'available' | 'written_off';
}
