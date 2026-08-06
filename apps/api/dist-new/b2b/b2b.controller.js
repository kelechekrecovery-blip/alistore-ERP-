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
exports.B2BController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const b2b_dto_1 = require("./b2b.dto");
const b2b_service_1 = require("./b2b.service");
let B2BController = class B2BController {
    constructor(b2b) {
        this.b2b = b2b;
    }
    profile(user) {
        return this.b2b.profile(this.customerId(user));
    }
    upsertProfile(user, dto) {
        return this.b2b.upsertProfile(this.customerId(user), dto);
    }
    mine(user) {
        return this.b2b.mine(this.customerId(user));
    }
    request(user, dto) {
        return this.b2b.request(this.customerId(user), dto);
    }
    accept(user, id) {
        return this.b2b.accept(id, this.customerId(user));
    }
    list(query) {
        return this.b2b.list(query.status);
    }
    update(user, id, dto) {
        return this.b2b.update(id, dto, user.customerId);
    }
    customerId(user) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        return user.customerId;
    }
};
exports.B2BController = B2BController;
__decorate([
    (0, common_1.Get)('profile'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Current customer business buyer profile' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], B2BController.prototype, "profile", null);
__decorate([
    (0, common_1.Put)('profile'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiOkResponse)({ description: 'Business profile saved.' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, b2b_dto_1.UpsertBusinessProfileDto]),
    __metadata("design:returntype", void 0)
], B2BController.prototype, "upsertProfile", null);
__decorate([
    (0, common_1.Get)('quotes/mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], B2BController.prototype, "mine", null);
__decorate([
    (0, common_1.Post)('quotes'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Wholesale quote request created and ledgered.' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, b2b_dto_1.CreateB2BQuoteDto]),
    __metadata("design:returntype", void 0)
], B2BController.prototype, "request", null);
__decorate([
    (0, common_1.Patch)('quotes/:id/accept'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], B2BController.prototype, "accept", null);
__decorate([
    (0, common_1.Get)('quotes'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('b2b', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [b2b_dto_1.ListB2BQuotesQueryDto]),
    __metadata("design:returntype", void 0)
], B2BController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)('quotes/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('b2b', 'update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, b2b_dto_1.UpdateB2BQuoteDto]),
    __metadata("design:returntype", void 0)
], B2BController.prototype, "update", null);
exports.B2BController = B2BController = __decorate([
    (0, swagger_1.ApiTags)('b2b'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('b2b'),
    __metadata("design:paramtypes", [b2b_service_1.B2BService])
], B2BController);
//# sourceMappingURL=b2b.controller.js.map