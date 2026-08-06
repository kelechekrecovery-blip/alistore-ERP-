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
exports.PaymentWebhookDto = exports.CreatePaymentIntentDto = exports.ONLINE_PAYMENT_METHODS = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
exports.ONLINE_PAYMENT_METHODS = [
    client_1.PaymentMethod.card,
    client_1.PaymentMethod.qr_mbank,
    client_1.PaymentMethod.qr_odengi,
    client_1.PaymentMethod.installment,
];
class CreatePaymentIntentDto {
}
exports.CreatePaymentIntentDto = CreatePaymentIntentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_order_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePaymentIntentDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.ONLINE_PAYMENT_METHODS, example: client_1.PaymentMethod.qr_mbank }),
    (0, class_validator_1.IsIn)(exports.ONLINE_PAYMENT_METHODS),
    __metadata("design:type", Object)
], CreatePaymentIntentDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 109900 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreatePaymentIntentDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://ali.kg/account/orders/clx_order_001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePaymentIntentDto.prototype, "returnUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'web_checkout' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePaymentIntentDto.prototype, "actor", void 0);
class PaymentWebhookDto {
}
exports.PaymentWebhookDto = PaymentWebhookDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.ONLINE_PAYMENT_METHODS, example: client_1.PaymentMethod.qr_mbank }),
    (0, class_validator_1.IsIn)(exports.ONLINE_PAYMENT_METHODS),
    __metadata("design:type", Object)
], PaymentWebhookDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_order_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentWebhookDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 109900 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PaymentWebhookDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'mbank-clx_order_001-20260707162000' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentWebhookDto.prototype, "txnId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['succeeded', 'failed'], example: 'succeeded' }),
    (0, class_validator_1.IsIn)(['succeeded', 'failed']),
    __metadata("design:type", String)
], PaymentWebhookDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'sandbox' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaymentWebhookDto.prototype, "actor", void 0);
//# sourceMappingURL=payment-intents.dto.js.map