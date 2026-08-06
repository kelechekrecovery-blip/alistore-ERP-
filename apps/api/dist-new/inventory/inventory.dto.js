"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MovementDto = exports.PayConsignmentPayoutDto = exports.CreateConsignmentPayoutDto = exports.ReceiveQuantityConsignmentDto = exports.ReceiveConsignmentDto = exports.ValuationRollForwardQueryDto = exports.DisposeQuarantineDto = exports.DiagnoseQuarantineDto = exports.ReceiveQuantityDto = exports.ReceiveDto = exports.TransferQuantityDto = exports.TransferDto = exports.CountDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
class CountDto {
}
exports.CountDto = CountDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_product_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CountDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1', description: 'Location being counted' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CountDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 7, description: 'Physically counted quantity' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CountDto.prototype, "counted", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'warehouse_lead' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CountDto.prototype, "requester", void 0);
class TransferDto {
}
exports.TransferDto = TransferDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'IPH-15-128-UNIT-1', description: 'IMEI of the unit to move' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TransferDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-2', description: 'Destination branch/location' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TransferDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'дозаказ филиала' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TransferDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'warehouse_lead' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TransferDto.prototype, "requester", void 0);
class TransferQuantityDto {
}
exports.TransferQuantityDto = TransferQuantityDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'quantity-transfer-01' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], TransferQuantityDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_product_accessory' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TransferQuantityDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], TransferQuantityDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-2' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], TransferQuantityDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 5 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], TransferQuantityDto.prototype, "qty", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'пополнение точки' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], TransferQuantityDto.prototype, "reason", void 0);
class ReceiveDto {
}
exports.ReceiveDto = ReceiveDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_product_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1', description: 'Receiving branch/location' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String], example: ['IPH-15-128-UNIT-3', 'IPH-15-128-UNIT-4'] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ReceiveDto.prototype, "imeis", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, example: 80000, description: 'Immutable acquisition cost per unit' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ReceiveDto.prototype, "unitCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['A', 'B', 'C'], example: 'A' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['A', 'B', 'C']),
    __metadata("design:type", String)
], ReceiveDto.prototype, "grade", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'поставка #INV-001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveDto.prototype, "reason", void 0);
class ReceiveQuantityDto {
}
exports.ReceiveQuantityDto = ReceiveQuantityDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'receive-2026-07-21-001' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ReceiveQuantityDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_product_accessory' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveQuantityDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1', description: 'Receiving branch/location' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveQuantityDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 25 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ReceiveQuantityDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, example: 1200, description: 'Immutable acquisition cost per unit' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ReceiveQuantityDto.prototype, "unitCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'поставка #INV-001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveQuantityDto.prototype, "reason", void 0);
class DiagnoseQuarantineDto {
}
exports.DiagnoseQuarantineDto = DiagnoseQuarantineDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['resellable', 'repair', 'write_off'] }),
    (0, class_validator_1.IsIn)(['resellable', 'repair', 'write_off']),
    __metadata("design:type", String)
], DiagnoseQuarantineDto.prototype, "diagnosis", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Корпус и пломбы проверены' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], DiagnoseQuarantineDto.prototype, "notes", void 0);
class DisposeQuarantineDto {
}
exports.DisposeQuarantineDto = DisposeQuarantineDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['restock', 'repair', 'write_off'] }),
    (0, class_validator_1.IsIn)(['restock', 'repair', 'write_off']),
    __metadata("design:type", String)
], DisposeQuarantineDto.prototype, "disposition", void 0);
class ValuationRollForwardQueryDto {
}
exports.ValuationRollForwardQueryDto = ValuationRollForwardQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-01T00:00:00.000Z' }),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], ValuationRollForwardQueryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-08-01T00:00:00.000Z' }),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], ValuationRollForwardQueryDto.prototype, "to", void 0);
class ReceiveConsignmentDto {
}
exports.ReceiveConsignmentDto = ReceiveConsignmentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'consignment-receive-01' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ReceiveConsignmentDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_product_used_phone' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveConsignmentDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'USED-IP12-001' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ReceiveConsignmentDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ReceiveConsignmentDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Клиент Б.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], ReceiveConsignmentDto.prototype, "ownerName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '+996555123456' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], ReceiveConsignmentDto.prototype, "ownerContact", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, maximum: 10000, example: 1000, description: 'Commission in basis points; 1000 = 10%' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10000),
    __metadata("design:type", Number)
], ReceiveConsignmentDto.prototype, "commissionBps", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['A', 'B', 'C'], example: 'B' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['A', 'B', 'C']),
    __metadata("design:type", String)
], ReceiveConsignmentDto.prototype, "grade", void 0);
class ReceiveQuantityConsignmentDto {
}
exports.ReceiveQuantityConsignmentDto = ReceiveQuantityConsignmentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'quantity-consignment-receive-01' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ReceiveQuantityConsignmentDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_product_accessory' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveQuantityConsignmentDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ReceiveQuantityConsignmentDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 20 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ReceiveQuantityConsignmentDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Поставщик А.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], ReceiveQuantityConsignmentDto.prototype, "ownerName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '+996555123456' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], ReceiveQuantityConsignmentDto.prototype, "ownerContact", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, maximum: 10000, example: 1500 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10000),
    __metadata("design:type", Number)
], ReceiveQuantityConsignmentDto.prototype, "commissionBps", void 0);
class CreateConsignmentPayoutDto {
}
exports.CreateConsignmentPayoutDto = CreateConsignmentPayoutDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'consignment-payout-01' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateConsignmentPayoutDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String], example: ['clx_consignment_01'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateConsignmentPayoutDto.prototype, "itemIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String], example: ['clx_quantity_consignment_01'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateConsignmentPayoutDto.prototype, "quantityAllocationIds", void 0);
const CONSIGNMENT_PAYOUT_METHODS = [
    client_1.PaymentMethod.cash,
    client_1.PaymentMethod.card,
    client_1.PaymentMethod.qr_mbank,
    client_1.PaymentMethod.qr_odengi,
    client_1.PaymentMethod.bakai_pos,
    client_1.PaymentMethod.obank,
];
class PayConsignmentPayoutDto {
}
exports.PayConsignmentPayoutDto = PayConsignmentPayoutDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'bank-transfer-2026-001' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], PayConsignmentPayoutDto.prototype, "paymentKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: [client_1.PaymentMethod.cash, client_1.PaymentMethod.card, client_1.PaymentMethod.qr_mbank, client_1.PaymentMethod.qr_odengi, client_1.PaymentMethod.bakai_pos, client_1.PaymentMethod.obank],
        default: client_1.PaymentMethod.cash,
        description: 'Фактический канал выплаты владельцу.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(CONSIGNMENT_PAYOUT_METHODS),
    __metadata("design:type", String)
], PayConsignmentPayoutDto.prototype, "paymentMethod", void 0);
class MovementDto {
}
exports.MovementDto = MovementDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_product_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MovementDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 2, description: 'Quantity affected' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], MovementDto.prototype, "qty", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['write_off', 'adjust'], example: 'write_off' }),
    (0, class_validator_1.IsIn)(['write_off', 'adjust']),
    __metadata("design:type", String)
], MovementDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'BISHKEK-1', description: 'Required for quantity-tracked stock' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], MovementDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['increase', 'decrease'], example: 'decrease' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['increase', 'decrease']),
    __metadata("design:type", String)
], MovementDto.prototype, "direction", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'бой при транспортировке' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MovementDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'clx_inventory_count_movement',
        description: 'Observation movement that this adjustment reconciles.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MovementDto.prototype, "countMovementId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'warehouse_lead' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MovementDto.prototype, "requester", void 0);
//# sourceMappingURL=inventory.dto.js.map