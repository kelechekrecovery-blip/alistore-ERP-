import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
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
  @IsString() reason!: string;

  /** Evidence (photo refs, notes) required for a failed delivery per Evidence Vault. */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
}
