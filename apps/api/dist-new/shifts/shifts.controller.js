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
exports.ShiftsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const shifts_service_1 = require("./shifts.service");
const shifts_dto_1 = require("./shifts.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const staff_principal_1 = require("../auth/staff-principal");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const errors_1 = require("../common/errors");
let ShiftsController = class ShiftsController {
    constructor(shifts, staffAuth) {
        this.shifts = shifts;
        this.staffAuth = staffAuth;
    }
    async current(user, _staffId) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.shifts.currentOpen(staffId);
    }
    async openShifts(user, point) {
        const staff = await this.staffAuth.me(await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
        return this.shifts.openShifts(point, staff.id, staff.role, staff.point);
    }
    async handoverTargets(user) {
        const staff = await this.staffAuth.me(await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
        return this.staffAuth.handoverTargets(staff.point, staff.id);
    }
    async get(user, id) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        const shift = await this.shifts.getForStaff(id, staffId, user.role);
        if (!shift)
            throw new common_1.NotFoundException(`Смена ${id} не найдена`);
        return shift;
    }
    async open(user, idempotencyKey, dto) {
        const staff = await this.staffAuth.me(await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
        return this.shifts.open({ ...dto, staffId: staff.id, point: staff.point }, staff.id, idempotencyKey);
    }
    async close(user, id, idempotencyKey, dto) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        const key = idempotencyKey?.trim();
        if (!key || key.length > 100) {
            throw new errors_1.ValidationError('idempotency_key_required', 'Требуется Idempotency-Key до 100 символов');
        }
        return this.shifts.close(id, dto, staffId, key, user.role);
    }
    async handover(user, id, idempotencyKey, dto) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.shifts.handover(id, dto, staffId, user.role, idempotencyKey);
    }
};
exports.ShiftsController = ShiftsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: "Staff member's currently open shift (or null)" }),
    (0, swagger_1.ApiOkResponse)({ description: 'Open shift or null.' }),
    (0, common_1.Get)('current'),
    (0, require_permission_decorator_1.RequirePermission)('shift', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('staffId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "current", null);
__decorate([
    (0, common_1.Get)('open'),
    (0, require_permission_decorator_1.RequirePermission)('shift', 'handover'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('point')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "openShifts", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Active colleagues at the caller point a drawer can be handed to' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Active staff at the caller point (excluding self): id, username, role.' }),
    (0, common_1.Get)('handover-targets'),
    (0, require_permission_decorator_1.RequirePermission)('shift', 'handover'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "handoverTargets", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get a cash shift; the caller’s own open drawer is redacted' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Cash shift id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Shift found.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Shift does not exist.' }),
    (0, common_1.Get)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('shift', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "get", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Open a cash shift (shift.opened)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Shift opened.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Staff already has an open shift.' }),
    (0, common_1.Post)('open'),
    (0, require_permission_decorator_1.RequirePermission)('shift', 'open'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, shifts_dto_1.OpenShiftDto]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "open", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Close a cash shift with a blind physical count (shift.closed / cash.shortage)',
    }),
    (0, swagger_1.ApiHeader)({ name: 'Idempotency-Key', required: true, description: 'Stable retry key, maximum 100 characters.' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Cash shift id' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Shift closed; diff recorded.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Shift already closed.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Shift does not exist or is not accessible.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Invalid counted amount or manager reconciliation reason.' }),
    (0, common_1.Post)(':id/close'),
    (0, require_permission_decorator_1.RequirePermission)('shift', 'close'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, shifts_dto_1.CloseShiftDto]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "close", null);
__decorate([
    (0, common_1.Post)(':id/handover'),
    (0, require_permission_decorator_1.RequirePermission)('shift', 'handover'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, shifts_dto_1.HandoverShiftDto]),
    __metadata("design:returntype", Promise)
], ShiftsController.prototype, "handover", null);
exports.ShiftsController = ShiftsController = __decorate([
    (0, swagger_1.ApiTags)('shifts'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('shifts'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [shifts_service_1.ShiftsService,
        staff_auth_service_1.StaffAuthService])
], ShiftsController);
//# sourceMappingURL=shifts.controller.js.map