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
exports.StorefrontBlocksAdminController = exports.StorefrontBlocksPublicController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const storefront_blocks_dto_1 = require("./storefront-blocks.dto");
const storefront_blocks_service_1 = require("./storefront-blocks.service");
let StorefrontBlocksPublicController = class StorefrontBlocksPublicController {
    constructor(blocks) {
        this.blocks = blocks;
    }
    publicBlocks(device) {
        return this.blocks.publicBlocks(device === 'mobile' || device === 'desktop' ? device : 'all');
    }
};
exports.StorefrontBlocksPublicController = StorefrontBlocksPublicController;
__decorate([
    (0, common_1.Get)('public'),
    __param(0, (0, common_1.Query)('device')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StorefrontBlocksPublicController.prototype, "publicBlocks", null);
exports.StorefrontBlocksPublicController = StorefrontBlocksPublicController = __decorate([
    (0, swagger_1.ApiTags)('storefront-blocks'),
    (0, common_1.Controller)('storefront-blocks'),
    __metadata("design:paramtypes", [storefront_blocks_service_1.StorefrontBlocksService])
], StorefrontBlocksPublicController);
let StorefrontBlocksAdminController = class StorefrontBlocksAdminController {
    constructor(blocks) {
        this.blocks = blocks;
    }
    list() { return this.blocks.list(); }
    create(user, dto) { return this.blocks.create(dto, user.customerId); }
    reorder(user, dto) { return this.blocks.reorder(dto, user.customerId); }
    update(user, id, dto) { return this.blocks.update(id, dto, user.customerId); }
    publish(user, id) { return this.blocks.publish(id, user.customerId); }
    schedule(user, id, dto) { return this.blocks.schedule(id, dto, user.customerId); }
    cancelSchedule(user, id) { return this.blocks.cancelSchedule(id, user.customerId); }
    archive(user, id) { return this.blocks.archive(id, user.customerId); }
};
exports.StorefrontBlocksAdminController = StorefrontBlocksAdminController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StorefrontBlocksAdminController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, storefront_blocks_dto_1.CreateStorefrontBlockDto]),
    __metadata("design:returntype", void 0)
], StorefrontBlocksAdminController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('reorder'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, storefront_blocks_dto_1.ReorderStorefrontBlocksDto]),
    __metadata("design:returntype", void 0)
], StorefrontBlocksAdminController.prototype, "reorder", null);
__decorate([
    (0, common_1.Post)(':id/update'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, storefront_blocks_dto_1.UpdateStorefrontBlockDto]),
    __metadata("design:returntype", void 0)
], StorefrontBlocksAdminController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/publish'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StorefrontBlocksAdminController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)(':id/schedule'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, storefront_blocks_dto_1.ScheduleStorefrontBlockDto]),
    __metadata("design:returntype", void 0)
], StorefrontBlocksAdminController.prototype, "schedule", null);
__decorate([
    (0, common_1.Post)(':id/cancel-schedule'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StorefrontBlocksAdminController.prototype, "cancelSchedule", null);
__decorate([
    (0, common_1.Post)(':id/archive'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StorefrontBlocksAdminController.prototype, "archive", null);
exports.StorefrontBlocksAdminController = StorefrontBlocksAdminController = __decorate([
    (0, swagger_1.ApiTags)('storefront-blocks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('storefront-blocks'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [storefront_blocks_service_1.StorefrontBlocksService])
], StorefrontBlocksAdminController);
//# sourceMappingURL=storefront-blocks.controller.js.map