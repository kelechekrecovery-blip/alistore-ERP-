import { ArrayMaxSize, IsArray, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRunDto {
  @ApiProperty({ example: 'courier_01' })
  @IsString() courierId!: string;

  @ApiProperty({
    minimum: 0,
    example: 154900,
    description: 'Total cash-on-delivery the courier is expected to collect and hand over',
  })
  @IsInt() @Min(0) codTotal!: number;

  @ApiPropertyOptional({ type: [String], description: 'Courier-fulfillment orders assigned to this run.' })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true })
  orderIds?: string[];
}

export class HandoverDto {
  @ApiProperty({ example: 'clx_run_001' })
  @IsString() runId!: string;

  @ApiProperty({ minimum: 0, example: 154900, description: 'Cash actually handed over' })
  @IsInt() @Min(0) amount!: number;

  /** Required when the handover does not match codTotal (diff ≠ 0). */
  @ApiPropertyOptional({
    description: 'Reason for a COD discrepancy. Mandatory when amount ≠ codTotal.',
    example: 'клиент доплатил картой на месте',
  })
  @IsOptional() @IsString() reason?: string;
}

export class FailDeliveryDto {
  @ApiProperty({ example: 'адрес не найден, клиент недоступен' })
  @IsString() @MaxLength(500) reason!: string;

  /** Evidence (photo refs, notes) required for a failed delivery per Evidence Vault. */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Idempotency key of the courier-owned Evidence image.' })
  @IsOptional() @IsString() @MaxLength(128) evidenceIdempotencyKey?: string;
}

export class RemoveFromRunDto {
  @ApiProperty({ example: 'клиент недоступен, перевоз завтра' })
  @IsString() @MaxLength(500) reason!: string;
}

export class CompleteDeliveryDto {
  @ApiProperty({ minimum: 0, example: 109900, description: 'Cash collected at delivery; API rejects amounts above the outstanding COD and records a remaining receivable for partial collection.' })
  @IsInt() @Min(0) codAmount!: number;

  @ApiPropertyOptional({
    description: 'Required when the customer pays less than the outstanding COD at the door.',
    example: 'Клиент внёс часть суммы, остаток подтверждён к оплате завтра',
  })
  @IsOptional() @IsString() @MaxLength(500) reason?: string;

  @ApiPropertyOptional({ description: 'Idempotency key of the courier-owned delivery Evidence image.' })
  @IsOptional() @IsString() @MaxLength(128) evidenceIdempotencyKey?: string;
}
