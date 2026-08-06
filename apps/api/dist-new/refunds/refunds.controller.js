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
exports.RefundsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const staff_principal_1 = require("../auth/staff-principal");
const permission_guard_1 = require("../authz/permission.guard");
const refunds_dto_1 = require("./refunds.dto");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const refunds_dto_2 = require("./refunds.dto");
const refunds_processor_1 = require("./refunds.processor");
const refunds_service_1 = require("./refunds.service");
let RefundsController = class RefundsController {
    constructor(refunds, processor, staffAuth) {
        this.refunds = refunds;
        this.processor = processor;
        this.staffAuth = staffAuth;
    }
    async create(user, returnId, idempotencyKey, dto) {
        const actor = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.refunds.request(returnId, dto, actor, requireIdempotencyKey(idempotencyKey));
    }
    get(id) {
        return this.refunds.get(id);
    }
    async retry(user, id, dto) {
        const actor = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        await this.processor.processRefund(id, actor, dto?.shiftId ? { shiftId: dto.shiftId } : undefined);
        return this.refunds.get(id);
    }
    async cancel(user, id, idempotencyKey, dto) {
        const actor = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.refunds.cancel(id, dto, actor, requireIdempotencyKey(idempotencyKey));
    }
    async resolve(user, id, idempotencyKey, dto) {
        const actor = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        await this.processor.resolveRefund(id, dto, actor, requireIdempotencyKey(idempotencyKey));
        return this.refunds.get(id);
    }
};
exports.RefundsController = RefundsController;
__decorate([
    (0, common_1.Post)('returns/:returnId/refunds'),
    (0, common_1.HttpCode)(202),
    (0, require_permission_decorator_1.RequirePermission)('payments', 'refund'),
    (0, swagger_1.ApiOperation)({ summary: 'Create an idempotent, approval-gated refund for a Return' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('returnId')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, refunds_dto_2.CreateRefundDto]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('refunds/:id'),
    (0, require_permission_decorator_1.RequirePermission)('refunds', 'read'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RefundsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('refunds/:id/retry'),
    (0, require_permission_decorator_1.RequirePermission)('refunds', 'retry'),
    (0, swagger_1.ApiOperation)({ summary: 'Retry queued or failed refund allocations safely' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, refunds_dto_1.RetryRefundDto]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "retry", null);
__decorate([
    (0, common_1.Post)('refunds/:id/cancel'),
    (0, require_permission_decorator_1.RequirePermission)('refunds', 'manage'),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel an unexecuted failed refund after provider reconciliation' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, refunds_dto_2.CancelRefundDto]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)('refunds/:id/resolve'),
    (0, require_permission_decorator_1.RequirePermission)('refunds', 'manage'),
    (0, swagger_1.ApiOperation)({ summary: 'Resolve a refund stuck without a provider callback: confirm or cancel (owner/admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, refunds_dto_2.ResolveRefundDto]),
    __metadata("design:returntype", Promise)
], RefundsController.prototype, "resolve", null);
exports.RefundsController = RefundsController = __decorate([
    (0, swagger_1.ApiTags)('refunds'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [refunds_service_1.RefundsService,
        refunds_processor_1.RefundProcessor,
        staff_auth_service_1.StaffAuthService])
], RefundsController);
function requireIdempotencyKey(value) {
    const key = value?.trim();
    if (!key)
        throw new common_1.BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128)
        throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
    return key;
}
//# sourceMappingURL=refunds.controller.js.map