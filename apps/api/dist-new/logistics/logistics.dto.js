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
exports.UpdateStorePointDto = exports.CreateStorePointDto = exports.LogisticsDateQueryDto = exports.CreateDeliverySlotDto = exports.CreateDeliveryZoneDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateDeliveryZoneDto {
}
exports.CreateDeliveryZoneDto = CreateDeliveryZoneDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'center' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], CreateDeliveryZoneDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Центр' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateDeliveryZoneDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, minimum: 0 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateDeliveryZoneDto.prototype, "fee", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 60, minimum: 1 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateDeliveryZoneDto.prototype, "etaMinMinutes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 120, minimum: 1 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateDeliveryZoneDto.prototype, "etaMaxMinutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateDeliveryZoneDto.prototype, "active", void 0);
class CreateDeliverySlotDto {
}
exports.CreateDeliverySlotDto = CreateDeliverySlotDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDeliverySlotDto.prototype, "zoneId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], CreateDeliverySlotDto.prototype, "startsAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], CreateDeliverySlotDto.prototype, "endsAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateDeliverySlotDto.prototype, "capacity", void 0);
class LogisticsDateQueryDto {
}
exports.LogisticsDateQueryDto = LogisticsDateQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-15' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], LogisticsDateQueryDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LogisticsDateQueryDto.prototype, "zoneId", void 0);
class CreateStorePointDto {
}
exports.CreateStorePointDto = CreateStorePointDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'center' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[a-z0-9-]+$/),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], CreateStorePointDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'AliStore Центр' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateStorePointDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Бишкек, ул. Киевская 95' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], CreateStorePointDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Z0-9-]+$/),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateStorePointDto.prototype, "inventoryLocation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Ежедневно 10:00–21:00' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateStorePointDto.prototype, "hours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Назовите код выдачи сотруднику' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], CreateStorePointDto.prototype, "pickupInstructions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateStorePointDto.prototype, "active", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 100, minimum: 0, maximum: 10000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10_000),
    __metadata("design:type", Number)
], CreateStorePointDto.prototype, "sortOrder", void 0);
class UpdateStorePointDto {
}
exports.UpdateStorePointDto = UpdateStorePointDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'AliStore Центр' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateStorePointDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Бишкек, ул. Киевская 95' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], UpdateStorePointDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Ежедневно 10:00–21:00' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateStorePointDto.prototype, "hours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Назовите код выдачи сотруднику' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], UpdateStorePointDto.prototype, "pickupInstructions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateStorePointDto.prototype, "active", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 10000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10_000),
    __metadata("design:type", Number)
], UpdateStorePointDto.prototype, "sortOrder", void 0);
//# sourceMappingURL=logistics.dto.js.map