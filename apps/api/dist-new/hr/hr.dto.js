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
exports.DecideHrAbsenceDto = exports.RequestHrAbsenceDto = exports.OpenHrAttendanceDto = exports.CancelHrScheduleDto = exports.UpdateHrScheduleDto = exports.CreateHrScheduleDto = exports.HrWeekQueryDto = exports.PayHrPayrollDto = exports.HrPayrollQueryDto = void 0;
const client_1 = require("@prisma/client");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class HrPayrollQueryDto {
}
exports.HrPayrollQueryDto = HrPayrollQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07' }),
    (0, class_validator_1.Matches)(/^\d{4}-(0[1-9]|1[0-2])$/),
    __metadata("design:type", String)
], HrPayrollQueryDto.prototype, "period", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], HrPayrollQueryDto.prototype, "point", void 0);
class PayHrPayrollDto {
}
exports.PayHrPayrollDto = PayHrPayrollDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BANK-2026-07-001' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], PayHrPayrollDto.prototype, "externalRef", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['1000', '1010', '1020'], default: '1010' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['1000', '1010', '1020']),
    __metadata("design:type", String)
], PayHrPayrollDto.prototype, "fundingAccountCode", void 0);
class HrWeekQueryDto {
}
exports.HrWeekQueryDto = HrWeekQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-13' }),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], HrWeekQueryDto.prototype, "weekStart", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Bishkek / ЦУМ' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], HrWeekQueryDto.prototype, "point", void 0);
class CreateHrScheduleDto {
}
exports.CreateHrScheduleDto = CreateHrScheduleDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateHrScheduleDto.prototype, "staffId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateHrScheduleDto.prototype, "point", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-15' }),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CreateHrScheduleDto.prototype, "shiftDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-15T03:00:00.000Z' }),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], CreateHrScheduleDto.prototype, "startsAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-15T15:00:00.000Z' }),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], CreateHrScheduleDto.prototype, "endsAt", void 0);
class UpdateHrScheduleDto {
}
exports.UpdateHrScheduleDto = UpdateHrScheduleDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateHrScheduleDto.prototype, "point", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-15' }),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], UpdateHrScheduleDto.prototype, "shiftDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-15T03:00:00.000Z' }),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], UpdateHrScheduleDto.prototype, "startsAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-15T15:00:00.000Z' }),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], UpdateHrScheduleDto.prototype, "endsAt", void 0);
class CancelHrScheduleDto {
}
exports.CancelHrScheduleDto = CancelHrScheduleDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CancelHrScheduleDto.prototype, "reason", void 0);
class OpenHrAttendanceDto {
}
exports.OpenHrAttendanceDto = OpenHrAttendanceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenHrAttendanceDto.prototype, "scheduleId", void 0);
class RequestHrAbsenceDto {
}
exports.RequestHrAbsenceDto = RequestHrAbsenceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.HrAbsenceType }),
    (0, class_validator_1.IsEnum)(client_1.HrAbsenceType),
    __metadata("design:type", String)
], RequestHrAbsenceDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-20' }),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], RequestHrAbsenceDto.prototype, "startsOn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-24' }),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], RequestHrAbsenceDto.prototype, "endsOn", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], RequestHrAbsenceDto.prototype, "reason", void 0);
class DecideHrAbsenceDto {
}
exports.DecideHrAbsenceDto = DecideHrAbsenceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: [client_1.HrAbsenceStatus.approved, client_1.HrAbsenceStatus.rejected] }),
    (0, class_validator_1.IsEnum)(client_1.HrAbsenceStatus),
    __metadata("design:type", String)
], DecideHrAbsenceDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], DecideHrAbsenceDto.prototype, "note", void 0);
//# sourceMappingURL=hr.dto.js.map