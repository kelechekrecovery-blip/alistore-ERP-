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
exports.ExchangeDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const swagger_1 = require("@nestjs/swagger");
class ExchangeDto {
}
exports.ExchangeDto = ExchangeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_order_001', description: 'Order the old device was sold on' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExchangeDto.prototype, "originalOrderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'IPH-15-128-UNIT-1', description: 'IMEI being returned' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExchangeDto.prototype, "oldImei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_product_002', description: 'Product to exchange into' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExchangeDto.prototype, "newProductId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.PaymentMethod, example: client_1.PaymentMethod.cash, description: 'Method for the surcharge' }),
    (0, class_validator_1.IsEnum)(client_1.PaymentMethod),
    __metadata("design:type", String)
], ExchangeDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'clx_shift_001', description: 'Open actor-owned shift for a cash surcharge' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExchangeDto.prototype, "shiftId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'acquirer-exchange-001', description: 'Provider reference for a non-cash surcharge' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExchangeDto.prototype, "externalReference", void 0);
//# sourceMappingURL=exchanges.dto.js.map