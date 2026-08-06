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
exports.VoidPaymentDto = exports.RefundDto = exports.RefundAllocationDto = exports.SettleOrderReceivableDto = exports.PayDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
class PayDto {
}
exports.PayDto = PayDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_order_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.PaymentMethod, example: client_1.PaymentMethod.cash }),
    (0, class_validator_1.IsEnum)(client_1.PaymentMethod),
    __metadata("design:type", String)
], PayDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 109900 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PayDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'External transaction id used to deduplicate webhook retries.',
        example: 'mbank-20260706-0001',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayDto.prototype, "txnId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Open cash shift the payment belongs to (POS drawer reconciliation).',
        example: 'clx_shift_001',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayDto.prototype, "shiftId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Gift-card/store-credit code required for method=gift_card.',
        example: 'GC-ALISTORE-2026',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayDto.prototype, "giftCardCode", void 0);
class SettleOrderReceivableDto {
}
exports.SettleOrderReceivableDto = SettleOrderReceivableDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.PaymentMethod, example: client_1.PaymentMethod.card }),
    (0, class_validator_1.IsEnum)(client_1.PaymentMethod),
    __metadata("design:type", String)
], SettleOrderReceivableDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 20000 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], SettleOrderReceivableDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'provider-deposit-0001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SettleOrderReceivableDto.prototype, "txnId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'clx_shift_001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SettleOrderReceivableDto.prototype, "shiftId", void 0);
class RefundAllocationDto {
}
exports.RefundAllocationDto = RefundAllocationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_payment_001', description: 'Positive original tender to reverse.' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundAllocationDto.prototype, "paymentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 40000 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], RefundAllocationDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'clx_shift_001', description: 'Requester-owned open shift for this cash allocation.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundAllocationDto.prototype, "shiftId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'acquirer-refund-card-001', description: 'Unique provider/bank reference for this non-cash allocation.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundAllocationDto.prototype, "externalReference", void 0);
class RefundDto {
}
exports.RefundDto = RefundDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 109900, description: 'Total refund amount across all original tenders.' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], RefundDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'брак, возврат по акту' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'senior_seller_azamat' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundDto.prototype, "requester", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'clx_return_001', description: 'Approved return this refund settles.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundDto.prototype, "returnId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'clx_shift_001', description: 'Open requester-owned shift used for a cash payout.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundDto.prototype, "shiftId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'acquirer-refund-001', description: 'Provider/bank refund reference for non-cash tenders.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefundDto.prototype, "externalReference", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: [RefundAllocationDto],
        description: 'Explicit same-order tender allocations. Omit for a legacy single-tender refund.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => RefundAllocationDto),
    __metadata("design:type", Array)
], RefundDto.prototype, "allocations", void 0);
class VoidPaymentDto {
}
exports.VoidPaymentDto = VoidPaymentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'payment_intent_expired', description: 'Why the unfinished payment is being cancelled.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], VoidPaymentDto.prototype, "reason", void 0);
//# sourceMappingURL=payments.dto.js.map