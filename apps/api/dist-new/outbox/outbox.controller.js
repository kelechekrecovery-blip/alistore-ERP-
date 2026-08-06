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
exports.OutboxController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const staff_principal_1 = require("../auth/staff-principal");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const outbox_service_1 = require("./outbox.service");
let OutboxController = class OutboxController {
    constructor(outbox, staffAuth) {
        this.outbox = outbox;
        this.staffAuth = staffAuth;
    }
    async redrive(user, id) {
        const actor = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.outbox.redrive(id, actor);
    }
};
exports.OutboxController = OutboxController;
__decorate([
    (0, common_1.Post)(':id/redrive'),
    (0, common_1.HttpCode)(200),
    (0, require_permission_decorator_1.RequirePermission)('outbox', 'manage'),
    (0, swagger_1.ApiOperation)({ summary: 'Re-drive a failed outbox message: reset attempts and return it to the pending queue (owner/admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OutboxController.prototype, "redrive", null);
exports.OutboxController = OutboxController = __decorate([
    (0, swagger_1.ApiTags)('outbox'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('outbox'),
    __metadata("design:paramtypes", [outbox_service_1.OutboxService,
        staff_auth_service_1.StaffAuthService])
], OutboxController);
//# sourceMappingURL=outbox.controller.js.map