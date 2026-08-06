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
exports.PromotionsAdminController = exports.PromotionsPublicController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const optional_jwt_auth_guard_1 = require("../auth/optional-jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const promotions_dto_1 = require("./promotions.dto");
const promotions_service_1 = require("./promotions.service");
let PromotionsPublicController = class PromotionsPublicController {
    constructor(promotions) {
        this.promotions = promotions;
    }
    quote(user, dto) {
        return this.promotions.quote(dto, user?.typ === 'customer' ? user.customerId : undefined);
    }
};
exports.PromotionsPublicController = PromotionsPublicController;
__decorate([
    (0, common_1.Post)('quote'),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, promotions_dto_1.PromotionQuoteDto]),
    __metadata("design:returntype", void 0)
], PromotionsPublicController.prototype, "quote", null);
exports.PromotionsPublicController = PromotionsPublicController = __decorate([
    (0, swagger_1.ApiTags)('promotions'),
    (0, common_1.Controller)('promotions'),
    __metadata("design:paramtypes", [promotions_service_1.PromotionsService])
], PromotionsPublicController);
let PromotionsAdminController = class PromotionsAdminController {
    constructor(promotions) {
        this.promotions = promotions;
    }
    list() { return this.promotions.list(); }
    create(user, dto) { return this.promotions.create(dto, user.customerId); }
    update(user, id, dto) { return this.promotions.update(id, dto, user.customerId); }
    activate(user, id) { return this.promotions.activate(id, user.customerId); }
    pause(user, id) { return this.promotions.pause(id, user.customerId); }
};
exports.PromotionsAdminController = PromotionsAdminController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PromotionsAdminController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, promotions_dto_1.CreatePromotionDto]),
    __metadata("design:returntype", void 0)
], PromotionsAdminController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/update'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, promotions_dto_1.UpdatePromotionDto]),
    __metadata("design:returntype", void 0)
], PromotionsAdminController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/activate'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PromotionsAdminController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)(':id/pause'),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PromotionsAdminController.prototype, "pause", null);
exports.PromotionsAdminController = PromotionsAdminController = __decorate([
    (0, swagger_1.ApiTags)('promotions'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('promotions'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [promotions_service_1.PromotionsService])
], PromotionsAdminController);
//# sourceMappingURL=promotions.controller.js.map