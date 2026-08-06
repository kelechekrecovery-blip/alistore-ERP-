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
exports.ResolveOrderCancellationDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class ResolveOrderCancellationDto {
}
exports.ResolveOrderCancellationDto = ResolveOrderCancellationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.OrderCancellationResolutionAction }),
    (0, class_validator_1.IsEnum)(client_1.OrderCancellationResolutionAction),
    __metadata("design:type", String)
], ResolveOrderCancellationDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, description: 'Required for approve_partial; ignored for reject.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ResolveOrderCancellationDto.prototype, "refundAmount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, default: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ResolveOrderCancellationDto.prototype, "supplierExpenseAmount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.OrderCancellationFaultParty }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.OrderCancellationFaultParty),
    __metadata("design:type", String)
], ResolveOrderCancellationDto.prototype, "faultParty", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 3, maxLength: 500 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ResolveOrderCancellationDto.prototype, "ownerReason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: [String],
        maxItems: 20,
        description: 'EvidenceUpload ids bound to this order.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(20),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ResolveOrderCancellationDto.prototype, "evidenceIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123456', description: 'One-time TOTP step-up code.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(6),
    (0, class_validator_1.MaxLength)(12),
    __metadata("design:type", String)
], ResolveOrderCancellationDto.prototype, "totpToken", void 0);
//# sourceMappingURL=order-cancellation-resolution.dto.js.map