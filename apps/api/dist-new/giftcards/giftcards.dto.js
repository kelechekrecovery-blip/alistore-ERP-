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
exports.IssueGiftCardDto = exports.GIFT_CARD_PAYMENT_METHODS = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
exports.GIFT_CARD_PAYMENT_METHODS = ['cash', 'card', 'qr_mbank', 'qr_odengi'];
class IssueGiftCardDto {
}
exports.IssueGiftCardDto = IssueGiftCardDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.GIFT_CARD_PAYMENT_METHODS, example: 'cash', default: 'cash' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.GIFT_CARD_PAYMENT_METHODS),
    __metadata("design:type", Object)
], IssueGiftCardDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 50000 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], IssueGiftCardDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'GC-ALISTORE-2026' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], IssueGiftCardDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'clx_customer_001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], IssueGiftCardDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Подарочная карта за возврат' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], IssueGiftCardDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-12-31T18:00:00.000Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], IssueGiftCardDto.prototype, "expiresAt", void 0);
//# sourceMappingURL=giftcards.dto.js.map