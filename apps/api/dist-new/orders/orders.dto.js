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
exports.TransitionDto = exports.CreateMyOrderDto = exports.CreateOrderDto = exports.OrderItemDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const client_1 = require("@prisma/client");
const swagger_1 = require("@nestjs/swagger");
const attribution_dto_1 = require("../campaigns/attribution.dto");
const CHANNELS = ['web', 'app', 'mobile', 'staff_mobile', 'pos', 'telegram'];
const FULFILLMENT_TYPES = ['pickup', 'courier', 'express', 'store'];
const PAYMENT_MODES = ['prepaid', 'cod'];
class OrderItemDto {
}
exports.OrderItemDto = OrderItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'IPHONE-15-128-BLK' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OrderItemDto.prototype, "sku", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 1 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], OrderItemDto.prototype, "qty", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 109900 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], OrderItemDto.prototype, "price", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'IMEI/SN for serialized electronics tracked per physical unit.',
        example: '356789012345678',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OrderItemDto.prototype, "imei", void 0);
class CreateOrderDto {
}
exports.CreateOrderDto = CreateOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_customer_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: CHANNELS, example: 'web' }),
    (0, class_validator_1.IsIn)(CHANNELS),
    __metadata("design:type", Object)
], CreateOrderDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: FULFILLMENT_TYPES, example: 'pickup' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(FULFILLMENT_TYPES),
    __metadata("design:type", Object)
], CreateOrderDto.prototype, "fulfillmentType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: PAYMENT_MODES, default: 'prepaid' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(PAYMENT_MODES),
    __metadata("design:type", Object)
], CreateOrderDto.prototype, "paymentMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Server-managed active store/pickup point id.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "storePointId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'alistore-center' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "pickupPoint", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Бишкек, ул. Киевская 95' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "deliveryAddress", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'today 16:00-18:00' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "deliverySlot", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Server-managed delivery zone id.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "deliveryZoneId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Server-managed delivery slot id.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "deliverySlotId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 109900 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateOrderDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'SALE5000' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "promoCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: attribution_dto_1.OrderAttributionDto, description: 'First/last marketing touch captured by the storefront.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => attribution_dto_1.OrderAttributionDto),
    __metadata("design:type", attribution_dto_1.OrderAttributionDto)
], CreateOrderDto.prototype, "attribution", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, example: 4820, description: 'Authenticated checkout only; validated against the server ledger.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateOrderDto.prototype, "loyaltyPoints", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Required and must be true for storefront checkout. Confirms personal-data processing and stamps piiConsentAt.',
        example: true,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateOrderDto.prototype, "piiConsent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [OrderItemDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => OrderItemDto),
    __metadata("design:type", Array)
], CreateOrderDto.prototype, "items", void 0);
class CreateMyOrderDto extends (0, swagger_1.OmitType)(CreateOrderDto, ['customerId']) {
}
exports.CreateMyOrderDto = CreateMyOrderDto;
class TransitionDto {
}
exports.TransitionDto = TransitionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.OrderStatus, example: client_1.OrderStatus.paid }),
    (0, class_validator_1.IsEnum)(client_1.OrderStatus),
    __metadata("design:type", String)
], TransitionDto.prototype, "to", void 0);
//# sourceMappingURL=orders.dto.js.map