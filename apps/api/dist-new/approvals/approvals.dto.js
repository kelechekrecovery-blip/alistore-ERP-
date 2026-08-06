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
exports.DecideApprovalDto = void 0;
const class_validator_1 = require("class-validator");
const permissions_1 = require("../rbac/permissions");
const swagger_1 = require("@nestjs/swagger");
class DecideApprovalDto {
}
exports.DecideApprovalDto = DecideApprovalDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['approved', 'rejected'], example: 'approved' }),
    (0, class_validator_1.IsIn)(['approved', 'rejected']),
    __metadata("design:type", String)
], DecideApprovalDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'admin_gulnara', description: 'Deprecated: ignored when staff JWT is present.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DecideApprovalDto.prototype, "approver", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: permissions_1.Role, example: permissions_1.Role.admin, description: 'Deprecated: role comes from staff JWT.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(permissions_1.Role),
    __metadata("design:type", String)
], DecideApprovalDto.prototype, "approverRole", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'проверил акт возврата' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DecideApprovalDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '123456', description: 'TOTP step-up code required when approving.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DecideApprovalDto.prototype, "totpToken", void 0);
//# sourceMappingURL=approvals.dto.js.map