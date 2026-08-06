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
exports.StorefrontAdminController = exports.StorefrontPublicController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const storefront_dto_1 = require("./storefront.dto");
const approvals_service_1 = require("../approvals/approvals.service");
const storefront_service_1 = require("./storefront.service");
let StorefrontPublicController = class StorefrontPublicController {
    constructor(storefront) {
        this.storefront = storefront;
    }
    content() { return this.storefront.publicContent(); }
};
exports.StorefrontPublicController = StorefrontPublicController;
__decorate([
    (0, common_1.Get)('content'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StorefrontPublicController.prototype, "content", null);
exports.StorefrontPublicController = StorefrontPublicController = __decorate([
    (0, swagger_1.ApiTags)('storefront'),
    (0, common_1.Controller)('storefront'),
    __metadata("design:paramtypes", [storefront_service_1.StorefrontService])
], StorefrontPublicController);
let StorefrontAdminController = class StorefrontAdminController {
    constructor(storefront, approvals) {
        this.storefront = storefront;
        this.approvals = approvals;
    }
    list() { return this.storefront.list(); }
    create(user, dto) { return this.storefront.createDraft(dto, user.customerId); }
    async publish(user, id) {
        const parked = await this.approvals.request({
            action: 'storefront_publish',
            requester: user.customerId,
            reason: `Публикация ревизии витрины ${id}`,
            payload: { revisionId: id },
        });
        return { ...parked, action: 'storefront_publish' };
    }
    schedule(user, id, dto) { return this.storefront.schedule(id, dto, user.customerId); }
    cancelSchedule(user, id) { return this.storefront.cancelSchedule(id, user.customerId); }
};
exports.StorefrontAdminController = StorefrontAdminController;
__decorate([
    (0, common_1.Get)('revisions'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StorefrontAdminController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('revisions'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, storefront_dto_1.CreateStorefrontContentDto]),
    __metadata("design:returntype", void 0)
], StorefrontAdminController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('revisions/:id/publish'),
    (0, common_1.HttpCode)(202),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StorefrontAdminController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)('revisions/:id/schedule'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, storefront_dto_1.ScheduleStorefrontContentDto]),
    __metadata("design:returntype", void 0)
], StorefrontAdminController.prototype, "schedule", null);
__decorate([
    (0, common_1.Post)('revisions/:id/cancel-schedule'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StorefrontAdminController.prototype, "cancelSchedule", null);
exports.StorefrontAdminController = StorefrontAdminController = __decorate([
    (0, swagger_1.ApiTags)('storefront'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('storefront'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [storefront_service_1.StorefrontService, approvals_service_1.ApprovalsService])
], StorefrontAdminController);
//# sourceMappingURL=storefront.controller.js.map