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
exports.StaffAuthController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const staff_auth_service_1 = require("./staff-auth.service");
const staff_bootstrap_availability_1 = require("./staff-bootstrap-availability");
const password_policy_1 = require("./password-policy");
const staff_auth_dto_1 = require("./staff-auth.dto");
const auth_dto_1 = require("../auth/auth.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const web_session_1 = require("../auth/web-session");
let StaffAuthController = class StaffAuthController {
    constructor(staffAuth) {
        this.staffAuth = staffAuth;
    }
    async bootstrapStatus() {
        this.assertBootstrapAvailable();
        return { needsBootstrap: await this.staffAuth.needsBootstrap() };
    }
    async bootstrap(dto) {
        this.assertBootstrapAvailable();
        (0, password_policy_1.assertStrongPassword)(dto.password);
        return this.publicView(await this.staffAuth.bootstrapOwner(dto.username, dto.password, dto.point));
    }
    assertBootstrapAvailable() {
        if ((0, staff_bootstrap_availability_1.isStaffBootstrapAvailable)((name) => process.env[name]))
            return;
        throw new common_1.NotFoundException();
    }
    async login(dto, request, response) {
        const tokens = await this.staffAuth.login(dto.username, dto.password, dto.totp);
        if ((0, web_session_1.isStaffWebSessionRequest)(request))
            (0, web_session_1.setStaffSessionCookies)(response, tokens, process.env.NODE_ENV === 'production');
        if ((0, web_session_1.isStaffWebSessionRequest)(request)) {
            const { refreshToken: _refreshToken, ...safe } = tokens;
            return safe;
        }
        return tokens;
    }
    async refresh(dto, request, response) {
        const refreshToken = dto.refreshToken?.trim() || (0, web_session_1.readWebCookie)(request, web_session_1.STAFF_REFRESH_COOKIE);
        const tokens = await this.staffAuth.refresh(refreshToken ?? '');
        if ((0, web_session_1.isStaffWebSessionRequest)(request))
            (0, web_session_1.setStaffSessionCookies)(response, tokens, process.env.NODE_ENV === 'production');
        if ((0, web_session_1.isStaffWebSessionRequest)(request)) {
            const { refreshToken: _refreshToken, ...safe } = tokens;
            return safe;
        }
        return tokens;
    }
    async logout(dto, request, response) {
        const refreshToken = dto.refreshToken?.trim() || (0, web_session_1.readWebCookie)(request, web_session_1.STAFF_REFRESH_COOKIE);
        if (refreshToken)
            await this.staffAuth.logout(refreshToken);
        if ((0, web_session_1.isStaffWebSessionRequest)(request))
            (0, web_session_1.clearStaffSessionCookies)(response, process.env.NODE_ENV === 'production');
    }
    async createStaff(dto) {
        (0, password_policy_1.assertStrongPassword)(dto.password);
        return this.publicView(await this.staffAuth.createStaff(dto.username, dto.password, dto.role, dto.point));
    }
    async me(user) {
        this.assertStaff(user);
        return { ...(await this.staffAuth.me(user.customerId)), typ: user.typ };
    }
    setupTotp(user) {
        this.assertStaff(user);
        return this.staffAuth.setupTotp(user.customerId);
    }
    enableTotp(user, dto) {
        this.assertStaff(user);
        return this.staffAuth.enableTotp(user.customerId, dto.token);
    }
    disableTotp(user, dto) {
        this.assertStaff(user);
        return this.staffAuth.disableTotp(user.customerId, dto.token);
    }
    resetTotp(user, id) {
        return this.staffAuth.resetTotpByAdmin(user.customerId, id);
    }
    deactivate(user, id) {
        return this.staffAuth.deactivateStaff(user.customerId, id);
    }
    listStaff() {
        return this.staffAuth.listStaff();
    }
    changeRole(user, id, dto) {
        return this.staffAuth.changeRole(user.customerId, id, dto.role);
    }
    reactivate(user, id) {
        return this.staffAuth.reactivateStaff(user.customerId, id);
    }
    resetPassword(user, id, dto) {
        (0, password_policy_1.assertStrongPassword)(dto.password);
        return this.staffAuth.resetPasswordByAdmin(user.customerId, id, dto.password);
    }
    publicView(staff) {
        return this.staffAuth.publicView(staff);
    }
    assertStaff(user) {
        if (user.typ !== 'staff' || !user.role) {
            throw new common_1.ForbiddenException('Требуется staff JWT');
        }
    }
};
exports.StaffAuthController = StaffAuthController;
__decorate([
    (0, common_1.Get)('bootstrap-status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StaffAuthController.prototype, "bootstrapStatus", null);
__decorate([
    (0, common_1.Post)('bootstrap'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [staff_auth_dto_1.BootstrapOwnerDto]),
    __metadata("design:returntype", Promise)
], StaffAuthController.prototype, "bootstrap", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [staff_auth_dto_1.StaffLoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], StaffAuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RefreshDto, Object, Object]),
    __metadata("design:returntype", Promise)
], StaffAuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RefreshDto, Object, Object]),
    __metadata("design:returntype", Promise)
], StaffAuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('staff'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('staff', 'manage'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [staff_auth_dto_1.CreateStaffDto]),
    __metadata("design:returntype", Promise)
], StaffAuthController.prototype, "createStaff", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StaffAuthController.prototype, "me", null);
__decorate([
    (0, common_1.Post)('2fa/setup'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StaffAuthController.prototype, "setupTotp", null);
__decorate([
    (0, common_1.Post)('2fa/enable'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, staff_auth_dto_1.StaffTotpTokenDto]),
    __metadata("design:returntype", void 0)
], StaffAuthController.prototype, "enableTotp", null);
__decorate([
    (0, common_1.Post)('2fa/disable'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, staff_auth_dto_1.StaffTotpTokenDto]),
    __metadata("design:returntype", void 0)
], StaffAuthController.prototype, "disableTotp", null);
__decorate([
    (0, common_1.Post)('staff/:id/totp-reset'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('staff', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StaffAuthController.prototype, "resetTotp", null);
__decorate([
    (0, common_1.Post)('staff/:id/deactivate'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('staff', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StaffAuthController.prototype, "deactivate", null);
__decorate([
    (0, common_1.Get)('staff'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('staff', 'manage'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StaffAuthController.prototype, "listStaff", null);
__decorate([
    (0, common_1.Patch)('staff/:id/role'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('staff', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, staff_auth_dto_1.ChangeStaffRoleDto]),
    __metadata("design:returntype", void 0)
], StaffAuthController.prototype, "changeRole", null);
__decorate([
    (0, common_1.Post)('staff/:id/reactivate'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('staff', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StaffAuthController.prototype, "reactivate", null);
__decorate([
    (0, common_1.Post)('staff/:id/password-reset'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('staff', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, staff_auth_dto_1.ResetStaffPasswordDto]),
    __metadata("design:returntype", void 0)
], StaffAuthController.prototype, "resetPassword", null);
exports.StaffAuthController = StaffAuthController = __decorate([
    (0, common_1.Controller)('staff-auth'),
    __metadata("design:paramtypes", [staff_auth_service_1.StaffAuthService])
], StaffAuthController);
//# sourceMappingURL=staff-auth.controller.js.map