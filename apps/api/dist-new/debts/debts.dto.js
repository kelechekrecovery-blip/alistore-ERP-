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
exports.DebtPaymentDto = exports.DEBT_PAYMENT_METHODS = exports.CreateDebtDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CreateDebtDto {
}
exports.CreateDebtDto = CreateDebtDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_order_001', description: 'Order sold on credit' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDebtDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 35000, description: 'Debt principal (сом)' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateDebtDto.prototype, "principal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, example: 3, description: 'Number of installments' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateDebtDto.prototype, "installments", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, example: 30, description: 'Term in days (due date)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateDebtDto.prototype, "termDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'постоянный клиент' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDebtDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'debt-order-2026-001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateDebtDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'senior_seller' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDebtDto.prototype, "actor", void 0);
exports.DEBT_PAYMENT_METHODS = ['cash', 'card', 'qr_mbank', 'qr_odengi'];
class DebtPaymentDto {
}
exports.DebtPaymentDto = DebtPaymentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 12000, description: 'Payment amount (сом)' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], DebtPaymentDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.DEBT_PAYMENT_METHODS, example: 'cash', default: 'cash' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.DEBT_PAYMENT_METHODS),
    __metadata("design:type", Object)
], DebtPaymentDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'debt-payment-2026-001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], DebtPaymentDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'cashier_01' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DebtPaymentDto.prototype, "actor", void 0);
//# sourceMappingURL=debts.dto.js.map