import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CountDto {
  @ApiProperty({ example: 'clx_product_001' })
  @IsString() productId!: string;

  @ApiProperty({ example: 'BISHKEK-1', description: 'Location being counted' })
  @IsString() location!: string;

  @ApiProperty({ minimum: 0, example: 7, description: 'Physically counted quantity' })
  @IsInt() @Min(0) counted!: number;

  @ApiPropertyOptional({ example: 'warehouse_lead' })
  @IsOptional() @IsString() requester?: string;
}

export class TransferDto {
  @ApiProperty({ example: 'IPH-15-128-UNIT-1', description: 'IMEI of the unit to move' })
  @IsString() imei!: string;

  @ApiProperty({ example: 'BISHKEK-2', description: 'Destination branch/location' })
  @IsString() to!: string;

  @ApiPropertyOptional({ example: 'дозаказ филиала' })
  @IsOptional() @IsString() reason?: string;

  @ApiPropertyOptional({ example: 'warehouse_lead' })
  @IsOptional() @IsString() requester?: string;
}

export class TransferQuantityDto {
  @ApiProperty({ example: 'quantity-transfer-01' })
  @IsString() @MaxLength(128) idempotencyKey!: string;

  @ApiProperty({ example: 'clx_product_accessory' })
  @IsString() productId!: string;

  @ApiProperty({ example: 'BISHKEK-1' })
  @IsString() @MaxLength(64) from!: string;

  @ApiProperty({ example: 'BISHKEK-2' })
  @IsString() @MaxLength(64) to!: string;

  @ApiProperty({ minimum: 1, example: 5 })
  @IsInt() @Min(1) qty!: number;

  @ApiPropertyOptional({ example: 'пополнение точки' })
  @IsOptional() @IsString() @MaxLength(240) reason?: string;
}

export class ReceiveDto {
  @ApiProperty({ example: 'clx_product_001' })
  @IsString() productId!: string;

  @ApiProperty({ example: 'BISHKEK-1', description: 'Receiving branch/location' })
  @IsString() location!: string;

  @ApiProperty({ type: [String], example: ['IPH-15-128-UNIT-3', 'IPH-15-128-UNIT-4'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  imeis!: string[];

  @ApiPropertyOptional({ minimum: 0, example: 80000, description: 'Immutable acquisition cost per unit' })
  @IsOptional() @IsInt() @Min(0) unitCost?: number;

  @ApiPropertyOptional({ enum: ['A', 'B', 'C'], example: 'A' })
  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  grade?: 'A' | 'B' | 'C';

  @ApiPropertyOptional({ example: 'поставка #INV-001' })
  @IsOptional() @IsString() reason?: string;
}

export class ReceiveQuantityDto {
  /**
   * Единственный DTO приёмки без ключа — и единственный путь оприходования
   * количественного товара. Повтор запроса удваивал `onHand`, `inventoryValue`,
   * движение и слой оценки **согласованно**, поэтому `valuationReconciliation`
   * рапортовала `consistent: true`: приписка становилась видна только при
   * инвентаризации, уже как недостача с назначенным виновным.
   */
  @ApiProperty({ example: 'receive-2026-07-21-001' })
  @IsString() @MaxLength(128) idempotencyKey!: string;

  @ApiProperty({ example: 'clx_product_accessory' })
  @IsString() productId!: string;

  @ApiProperty({ example: 'BISHKEK-1', description: 'Receiving branch/location' })
  @IsString() location!: string;

  @ApiProperty({ minimum: 1, example: 25 })
  @IsInt() @Min(1) quantity!: number;

  @ApiPropertyOptional({ minimum: 0, example: 1200, description: 'Immutable acquisition cost per unit' })
  @IsOptional() @IsInt() @Min(0) unitCost?: number;

  @ApiPropertyOptional({ example: 'поставка #INV-001' })
  @IsOptional() @IsString() reason?: string;
}

export class DiagnoseQuarantineDto {
  @ApiProperty({ enum: ['resellable', 'repair', 'write_off'] })
  @IsIn(['resellable', 'repair', 'write_off'])
  diagnosis!: 'resellable' | 'repair' | 'write_off';

  @ApiPropertyOptional({ example: 'Корпус и пломбы проверены' })
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class DisposeQuarantineDto {
  @ApiProperty({ enum: ['restock', 'repair', 'write_off'] })
  @IsIn(['restock', 'repair', 'write_off'])
  disposition!: 'restock' | 'repair' | 'write_off';
}

export class ValuationRollForwardQueryDto {
  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  @IsISO8601({ strict: true })
  to!: string;
}

export class ReceiveConsignmentDto {
  @ApiProperty({ example: 'consignment-receive-01' })
  @IsString() @MaxLength(128) idempotencyKey!: string;

  @ApiProperty({ example: 'clx_product_used_phone' })
  @IsString() productId!: string;

  @ApiProperty({ example: 'USED-IP12-001' })
  @IsString() @MaxLength(64) imei!: string;

  @ApiProperty({ example: 'BISHKEK-1' })
  @IsString() @MaxLength(64) location!: string;

  @ApiProperty({ example: 'Клиент Б.' })
  @IsString() @MaxLength(160) ownerName!: string;

  @ApiPropertyOptional({ example: '+996555123456' })
  @IsOptional() @IsString() @MaxLength(160) ownerContact?: string;

  @ApiProperty({ minimum: 0, maximum: 10000, example: 1000, description: 'Commission in basis points; 1000 = 10%' })
  @IsInt() @Min(0) @Max(10000) commissionBps!: number;

  @ApiPropertyOptional({ enum: ['A', 'B', 'C'], example: 'B' })
  @IsOptional() @IsIn(['A', 'B', 'C']) grade?: 'A' | 'B' | 'C';
}

export class ReceiveQuantityConsignmentDto {
  @ApiProperty({ example: 'quantity-consignment-receive-01' })
  @IsString() @MaxLength(128) idempotencyKey!: string;

  @ApiProperty({ example: 'clx_product_accessory' })
  @IsString() productId!: string;

  @ApiProperty({ example: 'BISHKEK-1' })
  @IsString() @MaxLength(64) location!: string;

  @ApiProperty({ minimum: 1, example: 20 })
  @IsInt() @Min(1) quantity!: number;

  @ApiProperty({ example: 'Поставщик А.' })
  @IsString() @MaxLength(160) ownerName!: string;

  @ApiPropertyOptional({ example: '+996555123456' })
  @IsOptional() @IsString() @MaxLength(160) ownerContact?: string;

  @ApiProperty({ minimum: 0, maximum: 10000, example: 1500 })
  @IsInt() @Min(0) @Max(10000) commissionBps!: number;
}

export class CreateConsignmentPayoutDto {
  @ApiProperty({ example: 'consignment-payout-01' })
  @IsString() @MaxLength(128) idempotencyKey!: string;

  @ApiPropertyOptional({ type: [String], example: ['clx_consignment_01'] })
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) itemIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['clx_quantity_consignment_01'] })
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) quantityAllocationIds?: string[];
}

export class PayConsignmentPayoutDto {
  @ApiProperty({ example: 'bank-transfer-2026-001' })
  @IsString() @MaxLength(128) paymentKey!: string;
}

export class MovementDto {
  @ApiProperty({ example: 'clx_product_001' })
  @IsString() productId!: string;

  @ApiProperty({ minimum: 1, example: 2, description: 'Quantity affected' })
  @IsInt() @Min(1) qty!: number;

  @ApiProperty({ enum: ['write_off', 'adjust'], example: 'write_off' })
  @IsIn(['write_off', 'adjust']) type!: 'write_off' | 'adjust';

  @ApiPropertyOptional({ example: 'BISHKEK-1', description: 'Required for quantity-tracked stock' })
  @IsOptional() @IsString() @MaxLength(64) location?: string;

  @ApiPropertyOptional({ enum: ['increase', 'decrease'], example: 'decrease' })
  @IsOptional() @IsIn(['increase', 'decrease']) direction?: 'increase' | 'decrease';

  @ApiProperty({ example: 'бой при транспортировке' })
  @IsString() reason!: string;

  @ApiPropertyOptional({ example: 'warehouse_lead' })
  @IsOptional() @IsString() requester?: string;
}
