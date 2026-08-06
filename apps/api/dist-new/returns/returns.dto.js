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
exports.ReturnStatusDto = exports.ReturnSelectionDto = exports.CreateMineReturnDto = exports.CreateReturnDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const RETURN_STATUSES = [
    'requested',
    'under_review',
    'approved',
    'rejected',
    'processing',
    'paid',
    'reconciled',
];
class CreateReturnDto {
}
exports.CreateReturnDto = CreateReturnDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_order_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateReturnDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'не подошёл, возврат в 14 дней' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateReturnDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'customer or staff id' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateReturnDto.prototype, "requester", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => [ReturnSelectionDto], description: 'Omit to return the full order.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayUnique)((item) => item.orderItemId),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ReturnSelectionDto),
    __metadata("design:type", Array)
], CreateReturnDto.prototype, "items", void 0);
class CreateMineReturnDto {
}
exports.CreateMineReturnDto = CreateMineReturnDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_order_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateMineReturnDto.prototype, "orderId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'не подошёл, возврат в 14 дней' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateMineReturnDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => [ReturnSelectionDto], description: 'Omit to return the full order.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayUnique)((item) => item.orderItemId),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ReturnSelectionDto),
    __metadata("design:type", Array)
], CreateMineReturnDto.prototype, "items", void 0);
class ReturnSelectionDto {
}
exports.ReturnSelectionDto = ReturnSelectionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_order_item_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReturnSelectionDto.prototype, "orderItemId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, example: 1 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ReturnSelectionDto.prototype, "qty", void 0);
class ReturnStatusDto {
}
exports.ReturnStatusDto = ReturnStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: RETURN_STATUSES, example: 'under_review' }),
    (0, class_validator_1.IsIn)(RETURN_STATUSES),
    __metadata("design:type", Object)
], ReturnStatusDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'BISHKEK-1', description: 'Required when status=reconciled.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReturnStatusDto.prototype, "location", void 0);
//# sourceMappingURL=returns.dto.js.map