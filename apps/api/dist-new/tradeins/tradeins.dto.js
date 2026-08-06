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
exports.TradeInViewDto = exports.CreateTradeInDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
class CreateTradeInDto {
}
exports.CreateTradeInDto = CreateTradeInDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Required for guest capability and staff intake. Ignored for customer JWT requests.',
        example: 'clx_customer_001',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTradeInDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'iPhone 13 Pro 256GB' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTradeInDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Device IMEI or serial captured during intake.', example: '359-DUP-1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTradeInDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.Grade, example: client_1.Grade.B }),
    (0, class_validator_1.IsEnum)(client_1.Grade),
    __metadata("design:type", String)
], CreateTradeInDto.prototype, "grade", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, example: 42000, description: 'Цена только для staff intake; публичный trade-in считает её на сервере.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateTradeInDto.prototype, "price", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Seller passport or national id. Stored for anti-fraud, masked in responses.',
        example: 'ID1234567',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTradeInDto.prototype, "sellerPassport", void 0);
class TradeInViewDto {
}
exports.TradeInViewDto = TradeInViewDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], TradeInViewDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], TradeInViewDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], TradeInViewDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], TradeInViewDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.Grade }),
    __metadata("design:type", String)
], TradeInViewDto.prototype, "grade", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], TradeInViewDto.prototype, "price", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Object)
], TradeInViewDto.prototype, "contractId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ID1***67' }),
    __metadata("design:type", String)
], TradeInViewDto.prototype, "sellerPassportMasked", void 0);
//# sourceMappingURL=tradeins.dto.js.map