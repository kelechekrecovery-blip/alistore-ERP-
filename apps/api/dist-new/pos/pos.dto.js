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
exports.PosSaleDto = exports.PosPaymentDto = exports.PosCustomerLookupDto = exports.PosLineDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const client_1 = require("@prisma/client");
const swagger_1 = require("@nestjs/swagger");
class PosLineDto {
}
exports.PosLineDto = PosLineDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_product_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosLineDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'IPH-15-128' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosLineDto.prototype, "sku", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 109900 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PosLineDto.prototype, "price", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 1 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PosLineDto.prototype, "qty", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '356789012345678', description: 'Exact serialized unit selected by scanner.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosLineDto.prototype, "imei", void 0);
class PosCustomerLookupDto {
}
exports.PosCustomerLookupDto = PosCustomerLookupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '+996700123456' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(16),
    __metadata("design:type", String)
], PosCustomerLookupDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], PosCustomerLookupDto.prototype, "point", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'pos_20260720_0001' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PosCustomerLookupDto.prototype, "clientSaleId", void 0);
class PosPaymentDto {
}
exports.PosPaymentDto = PosPaymentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.PaymentMethod, example: client_1.PaymentMethod.cash }),
    (0, class_validator_1.IsEnum)(client_1.PaymentMethod),
    __metadata("design:type", String)
], PosPaymentDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 50000 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PosPaymentDto.prototype, "amount", void 0);
class PosSaleDto {
}
exports.PosSaleDto = PosSaleDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'staff_seller_01', description: 'Derived from staff JWT for HTTP requests.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosSaleDto.prototype, "staffId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosSaleDto.prototype, "point", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: client_1.PaymentMethod,
        example: client_1.PaymentMethod.cash,
        description: 'Legacy single payment method. Use payments[] for split tenders.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.PaymentMethod),
    __metadata("design:type", String)
], PosSaleDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: () => [PosPaymentDto],
        description: 'Split payment tenders. Amounts must add up exactly to the sale total.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PosPaymentDto),
    __metadata("design:type", Array)
], PosSaleDto.prototype, "payments", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 100, example: 10, description: 'Discount %' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], PosSaleDto.prototype, "discountPct", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Approved discount/margin approvalId — required to complete a gated sale' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosSaleDto.prototype, "approvalId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'постоянный клиент, акция' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosSaleDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Short-lived signed binding returned by the authenticated POS customer lookup.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(4096),
    __metadata("design:type", String)
], PosSaleDto.prototype, "customerBinding", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Client-generated sale id for retry idempotency. Web/mobile always send one; if ' +
            'omitted, the server derives a windowed cart fingerprint so a retry still cannot ' +
            'create a second order.',
        example: 'pos_20260707_0001',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosSaleDto.prototype, "clientSaleId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [PosLineDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PosLineDto),
    __metadata("design:type", Array)
], PosSaleDto.prototype, "lines", void 0);
//# sourceMappingURL=pos.dto.js.map