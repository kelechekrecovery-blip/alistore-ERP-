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
exports.WarrantyStatusDto = exports.OpenWarrantyDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const STATUSES = [
    'created', 'received', 'diagnostics', 'waiting_supplier',
    'approved', 'rejected', 'repaired', 'replaced', 'closed',
];
class OpenWarrantyDto {
}
exports.OpenWarrantyDto = OpenWarrantyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'IPH-15-128-UNIT-1' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenWarrantyDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_customer_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenWarrantyDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'не держит зарядку' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], OpenWarrantyDto.prototype, "problem", void 0);
class WarrantyStatusDto {
}
exports.WarrantyStatusDto = WarrantyStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: STATUSES, example: 'diagnostics' }),
    (0, class_validator_1.IsIn)(STATUSES),
    __metadata("design:type", Object)
], WarrantyStatusDto.prototype, "status", void 0);
//# sourceMappingURL=warranty.dto.js.map