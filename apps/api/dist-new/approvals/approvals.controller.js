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
exports.ApprovalsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const approvals_service_1 = require("./approvals.service");
const approvals_dto_1 = require("./approvals.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let ApprovalsController = class ApprovalsController {
    constructor(approvals) {
        this.approvals = approvals;
    }
    list(user, status) {
        this.assertStaff(user);
        return this.approvals.list(status ?? 'requested');
    }
    async get(user, id) {
        this.assertStaff(user);
        const approval = await this.approvals.get(id);
        if (!approval)
            throw new common_1.NotFoundException(`Approval ${id} не найден`);
        return approval;
    }
    async decide(user, id, dto) {
        this.assertStaff(user);
        const input = {
            status: dto.status,
            approver: user.customerId,
            approverRole: user.role,
            reason: dto.reason,
        };
        return this.approvals.decideWithStepUp(id, input, dto.totpToken);
    }
    assertStaff(user) {
        if (user.typ !== 'staff' || !user.role) {
            throw new common_1.ForbiddenException('Требуется staff JWT');
        }
    }
};
exports.ApprovalsController = ApprovalsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List approvals (default: pending) — Approval Inbox' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Approvals, newest first.' }),
    (0, require_permission_decorator_1.RequirePermission)('approvals', 'read'),
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ApprovalsController.prototype, "list", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get an approval' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Approval does not exist.' }),
    (0, require_permission_decorator_1.RequirePermission)('approvals', 'read'),
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ApprovalsController.prototype, "get", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Approve (executes the parked action) or reject' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Decision recorded; action executed on approve.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Approval already decided.' }),
    (0, common_1.Patch)(':id/decide'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, approvals_dto_1.DecideApprovalDto]),
    __metadata("design:returntype", Promise)
], ApprovalsController.prototype, "decide", null);
exports.ApprovalsController = ApprovalsController = __decorate([
    (0, swagger_1.ApiTags)('approvals'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('approvals'),
    __metadata("design:paramtypes", [approvals_service_1.ApprovalsService])
], ApprovalsController);
//# sourceMappingURL=approvals.controller.js.map