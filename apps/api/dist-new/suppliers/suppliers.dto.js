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
exports.RmaTransitionDto = exports.OpenRmaDto = exports.CreateSupplierDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const RMA_TARGETS = [
    'shipped',
    'accepted',
    'repaired',
    'replaced',
    'refunded',
    'rejected',
    'closed',
];
class CreateSupplierDto {
}
exports.CreateSupplierDto = CreateSupplierDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'TechDistribution KG' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSupplierDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '+996700000000' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSupplierDto.prototype, "contact", void 0);
class OpenRmaDto {
}
exports.OpenRmaDto = OpenRmaDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_supplier_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenRmaDto.prototype, "supplierId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'IPH-15-128-UNIT-3', description: 'IMEI of the defective unit' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenRmaDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'не включается из коробки' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenRmaDto.prototype, "defect", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'warehouse_lead' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenRmaDto.prototype, "actor", void 0);
class RmaTransitionDto {
}
exports.RmaTransitionDto = RmaTransitionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: RMA_TARGETS, example: 'shipped' }),
    (0, class_validator_1.IsIn)(RMA_TARGETS),
    __metadata("design:type", Object)
], RmaTransitionDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'warehouse_lead' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RmaTransitionDto.prototype, "actor", void 0);
//# sourceMappingURL=suppliers.dto.js.map