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
exports.HandoverShiftDto = exports.CloseShiftDto = exports.OpenShiftDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class OpenShiftDto {
}
exports.OpenShiftDto = OpenShiftDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'staff_seller_01' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenShiftDto.prototype, "staffId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1', description: 'Point of sale / branch code' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenShiftDto.prototype, "point", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 5000, description: 'Opening cash in the drawer (сом)' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], OpenShiftDto.prototype, "openCash", void 0);
class CloseShiftDto {
}
exports.CloseShiftDto = CloseShiftDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 154900, description: 'Counted cash in the drawer at close' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CloseShiftDto.prototype, "closeCash", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Reason for a cash discrepancy. Mandatory when closeCash ≠ expected.',
        example: 'сдача выдана без чека',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CloseShiftDto.prototype, "reason", void 0);
class HandoverShiftDto {
}
exports.HandoverShiftDto = HandoverShiftDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Active staff member receiving the drawer.' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HandoverShiftDto.prototype, "toStaffId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, description: 'Cash physically counted before handover.' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], HandoverShiftDto.prototype, "countedCash", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Required when counted cash differs from expected.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HandoverShiftDto.prototype, "reason", void 0);
//# sourceMappingURL=shifts.dto.js.map