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
exports.CompleteDeliveryDto = exports.RemoveFromRunDto = exports.FailDeliveryDto = exports.HandoverDto = exports.CreateRunDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CreateRunDto {
}
exports.CreateRunDto = CreateRunDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'courier_01' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRunDto.prototype, "courierId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        minimum: 0,
        example: 154900,
        description: 'Total cash-on-delivery the courier is expected to collect and hand over',
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateRunDto.prototype, "codTotal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String], description: 'Courier-fulfillment orders assigned to this run.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(100),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateRunDto.prototype, "orderIds", void 0);
class HandoverDto {
}
exports.HandoverDto = HandoverDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_run_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HandoverDto.prototype, "runId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 154900, description: 'Cash actually handed over' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], HandoverDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Reason for a COD discrepancy. Mandatory when amount ≠ codTotal.',
        example: 'клиент доплатил картой на месте',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HandoverDto.prototype, "reason", void 0);
class FailDeliveryDto {
}
exports.FailDeliveryDto = FailDeliveryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'адрес не найден, клиент недоступен' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], FailDeliveryDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: 'object', additionalProperties: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], FailDeliveryDto.prototype, "evidence", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Idempotency key of the courier-owned Evidence image.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], FailDeliveryDto.prototype, "evidenceIdempotencyKey", void 0);
class RemoveFromRunDto {
}
exports.RemoveFromRunDto = RemoveFromRunDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'клиент недоступен, перевоз завтра' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], RemoveFromRunDto.prototype, "reason", void 0);
class CompleteDeliveryDto {
}
exports.CompleteDeliveryDto = CompleteDeliveryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 109900, description: 'Cash collected at delivery; API rejects amounts above the outstanding COD and records a remaining receivable for partial collection.' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CompleteDeliveryDto.prototype, "codAmount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Required when the customer pays less than the outstanding COD at the door.',
        example: 'Клиент внёс часть суммы, остаток подтверждён к оплате завтра',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CompleteDeliveryDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Idempotency key of the courier-owned delivery Evidence image.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CompleteDeliveryDto.prototype, "evidenceIdempotencyKey", void 0);
//# sourceMappingURL=courier.dto.js.map