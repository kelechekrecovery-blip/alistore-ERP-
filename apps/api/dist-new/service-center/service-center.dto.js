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
exports.ResolveLoanerDisputeDto = exports.ReturnLoanerLoanDto = exports.PrepareLoanerLoanDto = exports.RegisterLoanerDeviceDto = exports.ReplaceServiceDeviceDto = exports.AssignServiceTechnicianDto = exports.CompleteServiceRepairDto = exports.ReserveServicePartDto = exports.PayServiceWorkOrderDto = exports.ServicePaymentTenderDto = exports.CreatePaidRepairDto = exports.DiagnoseServiceWorkOrderDto = exports.CreateServiceWorkOrderDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CreateServiceWorkOrderDto {
}
exports.CreateServiceWorkOrderDto = CreateServiceWorkOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateServiceWorkOrderDto.prototype, "warrantyCaseId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateServiceWorkOrderDto.prototype, "technicianId", void 0);
class DiagnoseServiceWorkOrderDto {
}
exports.DiagnoseServiceWorkOrderDto = DiagnoseServiceWorkOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Требуется замена аккумулятора' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], DiagnoseServiceWorkOrderDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 4500, description: 'Полная смета в сомах' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], DiagnoseServiceWorkOrderDto.prototype, "estimateAmount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 500, default: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], DiagnoseServiceWorkOrderDto.prototype, "diagnosticFee", void 0);
class CreatePaidRepairDto {
}
exports.CreatePaidRepairDto = CreatePaidRepairDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '+996700000001' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\+?[0-9]{9,15}$/, { message: 'phone must be 9-15 digits, optional leading +' }),
    __metadata("design:type", String)
], CreatePaidRepairDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Айбек' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreatePaidRepairDto.prototype, "customerName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Xiaomi 13' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], CreatePaidRepairDto.prototype, "deviceName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'SN-123456789' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(4),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreatePaidRepairDto.prototype, "serial", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Требуется замена экрана' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], CreatePaidRepairDto.prototype, "problem", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreatePaidRepairDto.prototype, "technicianId", void 0);
class ServicePaymentTenderDto {
}
exports.ServicePaymentTenderDto = ServicePaymentTenderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.PaymentMethod, example: client_1.PaymentMethod.cash }),
    (0, class_validator_1.IsEnum)(client_1.PaymentMethod),
    __metadata("design:type", String)
], ServicePaymentTenderDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 5000 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ServicePaymentTenderDto.prototype, "amount", void 0);
class PayServiceWorkOrderDto {
}
exports.PayServiceWorkOrderDto = PayServiceWorkOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ServicePaymentTenderDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ServicePaymentTenderDto),
    __metadata("design:type", Array)
], PayServiceWorkOrderDto.prototype, "payments", void 0);
class ReserveServicePartDto {
}
exports.ReserveServicePartDto = ReserveServicePartDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReserveServicePartDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ReserveServicePartDto.prototype, "qty", void 0);
class CompleteServiceRepairDto {
}
exports.CompleteServiceRepairDto = CompleteServiceRepairDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Экран заменён, устройство прошло контроль качества' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CompleteServiceRepairDto.prototype, "summary", void 0);
class AssignServiceTechnicianDto {
}
exports.AssignServiceTechnicianDto = AssignServiceTechnicianDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], AssignServiceTechnicianDto.prototype, "technicianId", void 0);
class ReplaceServiceDeviceDto {
}
exports.ReplaceServiceDeviceDto = ReplaceServiceDeviceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(4),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], ReplaceServiceDeviceDto.prototype, "replacementImei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Устройство заменено после подтверждённого гарантийного случая' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], ReplaceServiceDeviceDto.prototype, "summary", void 0);
class RegisterLoanerDeviceDto {
}
exports.RegisterLoanerDeviceDto = RegisterLoanerDeviceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(4),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], RegisterLoanerDeviceDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Без повреждений, аккумулятор 92%' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], RegisterLoanerDeviceDto.prototype, "condition", void 0);
class PrepareLoanerLoanDto {
}
exports.PrepareLoanerLoanDto = PrepareLoanerLoanDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PrepareLoanerLoanDto.prototype, "loanerDeviceId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-20T12:00:00.000Z' }),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], PrepareLoanerLoanDto.prototype, "dueAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Без повреждений, комплект с кабелем' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], PrepareLoanerLoanDto.prototype, "issueCondition", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 5000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PrepareLoanerLoanDto.prototype, "depositAmount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'LN-2026-001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], PrepareLoanerLoanDto.prototype, "agreementRef", void 0);
class ReturnLoanerLoanDto {
}
exports.ReturnLoanerLoanDto = ReturnLoanerLoanDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Возвращено в исправном состоянии' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], ReturnLoanerLoanDto.prototype, "returnCondition", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Царапина на рамке' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], ReturnLoanerLoanDto.prototype, "damageNote", void 0);
class ResolveLoanerDisputeDto {
}
exports.ResolveLoanerDisputeDto = ResolveLoanerDisputeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['available', 'written_off'] }),
    (0, class_validator_1.IsIn)(['available', 'written_off']),
    __metadata("design:type", String)
], ResolveLoanerDisputeDto.prototype, "disposition", void 0);
//# sourceMappingURL=service-center.dto.js.map