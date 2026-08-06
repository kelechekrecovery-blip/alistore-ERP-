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
exports.ListB2BQuotesQueryDto = exports.UpdateB2BQuoteDto = exports.CreateB2BQuoteDto = exports.B2BQuoteItemDto = exports.UpsertBusinessProfileDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const PAYMENT_INTENTS = ['invoice', 'bank_transfer'];
const FULFILLMENT_TYPES = ['delivery', 'pickup'];
const STAFF_STATUSES = ['reviewing', 'quoted', 'rejected'];
const QUOTE_STATUSES = ['requested', ...STAFF_STATUSES, 'accepted'];
class UpsertBusinessProfileDto {
}
exports.UpsertBusinessProfileDto = UpsertBusinessProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ОсОО Техно Плюс' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(2, 160),
    __metadata("design:type", String)
], UpsertBusinessProfileDto.prototype, "companyName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '12345678901234' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(8, 20),
    __metadata("design:type", String)
], UpsertBusinessProfileDto.prototype, "taxId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Айбек Садыков' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(2, 120),
    __metadata("design:type", String)
], UpsertBusinessProfileDto.prototype, "contactName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'procurement@example.kg' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], UpsertBusinessProfileDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Бишкек, ул. Киевская 95' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(5, 240),
    __metadata("design:type", String)
], UpsertBusinessProfileDto.prototype, "billingAddress", void 0);
class B2BQuoteItemDto {
}
exports.B2BQuoteItemDto = B2BQuoteItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'IPHONE-15-128-BLK' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], B2BQuoteItemDto.prototype, "sku", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 10 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], B2BQuoteItemDto.prototype, "qty", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, example: 95000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], B2BQuoteItemDto.prototype, "targetPrice", void 0);
class CreateB2BQuoteDto {
}
exports.CreateB2BQuoteDto = CreateB2BQuoteDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [B2BQuoteItemDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => B2BQuoteItemDto),
    __metadata("design:type", Array)
], CreateB2BQuoteDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: PAYMENT_INTENTS, example: 'invoice' }),
    (0, class_validator_1.IsIn)(PAYMENT_INTENTS),
    __metadata("design:type", Object)
], CreateB2BQuoteDto.prototype, "paymentIntent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: FULFILLMENT_TYPES, example: 'delivery' }),
    (0, class_validator_1.IsIn)(FULFILLMENT_TYPES),
    __metadata("design:type", Object)
], CreateB2BQuoteDto.prototype, "fulfillmentType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Бишкек, ул. Киевская 95' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], CreateB2BQuoteDto.prototype, "deliveryAddress", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'alistore-center' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateB2BQuoteDto.prototype, "pickupPoint", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Нужны устройства до конца месяца' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], CreateB2BQuoteDto.prototype, "comment", void 0);
class UpdateB2BQuoteDto {
}
exports.UpdateB2BQuoteDto = UpdateB2BQuoteDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: STAFF_STATUSES, example: 'reviewing' }),
    (0, class_validator_1.IsIn)(STAFF_STATUSES),
    __metadata("design:type", Object)
], UpdateB2BQuoteDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, example: 900000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateB2BQuoteDto.prototype, "quotedTotal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Цена с доставкой и НДС' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], UpdateB2BQuoteDto.prototype, "staffNote", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-08-01T00:00:00.000Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateB2BQuoteDto.prototype, "validUntil", void 0);
class ListB2BQuotesQueryDto {
}
exports.ListB2BQuotesQueryDto = ListB2BQuotesQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: QUOTE_STATUSES }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(QUOTE_STATUSES),
    __metadata("design:type", Object)
], ListB2BQuotesQueryDto.prototype, "status", void 0);
//# sourceMappingURL=b2b.dto.js.map