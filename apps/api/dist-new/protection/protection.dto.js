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
exports.UpdateProtectionDto = exports.RequestProtectionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const PLAN_TYPES = ['accidental_damage', 'extended_warranty', 'full_protection'];
const COVERAGE_MONTHS = [12, 24];
const STAFF_STATUSES = ['reviewing', 'offered', 'rejected'];
class RequestProtectionDto {
}
exports.RequestProtectionDto = RequestProtectionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '356789012345678' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], RequestProtectionDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: PLAN_TYPES, example: 'full_protection' }),
    (0, class_validator_1.IsIn)(PLAN_TYPES),
    __metadata("design:type", Object)
], RequestProtectionDto.prototype, "planType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: COVERAGE_MONTHS, example: 12 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsIn)(COVERAGE_MONTHS),
    __metadata("design:type", Object)
], RequestProtectionDto.prototype, "coverageMonths", void 0);
class UpdateProtectionDto {
}
exports.UpdateProtectionDto = UpdateProtectionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: STAFF_STATUSES, example: 'offered' }),
    (0, class_validator_1.IsIn)(STAFF_STATUSES),
    __metadata("design:type", Object)
], UpdateProtectionDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, example: 8500 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateProtectionDto.prototype, "premium", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Покрытие после дистанционной диагностики' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], UpdateProtectionDto.prototype, "staffNote", void 0);
//# sourceMappingURL=protection.dto.js.map