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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HrController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const hr_dto_1 = require("./hr.dto");
const hr_service_1 = require("./hr.service");
let HrController = class HrController {
    constructor(hr) {
        this.hr = hr;
    }
    week(query) { return this.hr.week(query.weekStart, query.point); }
    myWeek(user, query) { return this.hr.week(query.weekStart, query.point, user.customerId); }
    createSchedule(user, key, dto) {
        return this.hr.createSchedule(dto, user.customerId, key);
    }
    updateSchedule(user, id, key, dto) {
        return this.hr.updateSchedule(id, dto, user.customerId, key);
    }
    cancelSchedule(user, id, key, dto) {
        return this.hr.cancelSchedule(id, dto.reason, user.customerId, key);
    }
    openAttendance(user, key, dto) {
        return this.hr.openAttendance(dto.scheduleId, user.customerId, key);
    }
    closeAttendance(user, key, dto) {
        return this.hr.closeAttendance(dto.scheduleId, user.customerId, key);
    }
    requestAbsence(user, key, dto) {
        return this.hr.requestAbsence(dto, user.customerId, key);
    }
    decideAbsence(user, id, dto) {
        return this.hr.decideAbsence(id, dto.status, dto.note, user.customerId);
    }
    payrollPreview(query) { return this.hr.payrollPreview(query.period, query.point); }
    payrollRuns(query) { return this.hr.payrollRuns(query.period, query.point); }
    postPayroll(user, key, dto) {
        return this.hr.postPayroll(dto.period, dto.point, user.customerId, key);
    }
    payPayroll(user, id, key, dto) {
        return this.hr.payPayroll(id, dto.externalRef, user.customerId, key, dto.fundingAccountCode);
    }
};
exports.HrController = HrController;
__decorate([
    (0, common_1.Get)('week'),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('hr', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [hr_dto_1.HrWeekQueryDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "week", null);
__decorate([
    (0, common_1.Get)('me/week'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, hr_dto_1.HrWeekQueryDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "myWeek", null);
__decorate([
    (0, common_1.Post)('schedules'),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('hr', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, hr_dto_1.CreateHrScheduleDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "createSchedule", null);
__decorate([
    (0, common_1.Patch)('schedules/:id'),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('hr', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, hr_dto_1.UpdateHrScheduleDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "updateSchedule", null);
__decorate([
    (0, common_1.Post)('schedules/:id/cancel'),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('hr', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, hr_dto_1.CancelHrScheduleDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "cancelSchedule", null);
__decorate([
    (0, common_1.Post)('me/attendance/open'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, hr_dto_1.OpenHrAttendanceDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "openAttendance", null);
__decorate([
    (0, common_1.Post)('me/attendance/close'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, hr_dto_1.OpenHrAttendanceDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "closeAttendance", null);
__decorate([
    (0, common_1.Post)('me/absences'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, hr_dto_1.RequestHrAbsenceDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "requestAbsence", null);
__decorate([
    (0, common_1.Post)('absences/:id/decide'),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('hr', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, hr_dto_1.DecideHrAbsenceDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "decideAbsence", null);
__decorate([
    (0, common_1.Get)('payroll/preview'),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('hr', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [hr_dto_1.HrPayrollQueryDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "payrollPreview", null);
__decorate([
    (0, common_1.Get)('payroll/runs'),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('hr', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [hr_dto_1.HrPayrollQueryDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "payrollRuns", null);
__decorate([
    (0, common_1.Post)('payroll/runs'),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('hr', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, hr_dto_1.HrPayrollQueryDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "postPayroll", null);
__decorate([
    (0, common_1.Post)('payroll/runs/:id/pay'),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('hr', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, hr_dto_1.PayHrPayrollDto]),
    __metadata("design:returntype", void 0)
], HrController.prototype, "payPayroll", null);
exports.HrController = HrController = __decorate([
    (0, swagger_1.ApiTags)('hr'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('hr'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard),
    __metadata("design:paramtypes", [hr_service_1.HrService])
], HrController);
//# sourceMappingURL=hr.controller.js.map