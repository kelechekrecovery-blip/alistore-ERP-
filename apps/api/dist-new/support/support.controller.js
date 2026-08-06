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
exports.SupportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const support_service_1 = require("./support.service");
const support_dto_1 = require("./support.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const optional_jwt_auth_guard_1 = require("../auth/optional-jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const authz_service_1 = require("../authz/authz.service");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const guest_capability_1 = require("../auth/guest-capability");
let SupportController = class SupportController {
    constructor(support, staffAuth, authz) {
        this.support = support;
        this.staffAuth = staffAuth;
        this.authz = authz;
    }
    openMine(user, idempotencyKey, dto) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        const key = requireIdempotencyKey(idempotencyKey);
        return this.support.open({ ...dto, customerId: user.customerId }, user.customerId, key);
    }
    mine(user, status) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        return this.support.list({ customerId: user.customerId, status });
    }
    open(dto, user, capability) {
        if (user?.typ === 'customer' && dto.customerId !== user.customerId) {
            throw new common_1.ForbiddenException('Нельзя открыть тикет от имени другого клиента');
        }
        const customerId = user?.typ === 'customer' ? user.customerId : dto.customerId;
        if (!user)
            (0, guest_capability_1.requireGuestCapability)(capability, 'support:create', customerId);
        if (user?.typ === 'staff')
            throw new common_1.ForbiddenException('Используйте staff support workflow');
        return this.support.open({ ...dto, customerId }, customerId);
    }
    async list(user, customerId, status) {
        if (customerId) {
            if (user?.typ === 'customer') {
                if (user.customerId !== customerId) {
                    throw new common_1.ForbiddenException('Нельзя читать тикеты другого клиента');
                }
            }
            else {
                await this.requireStaffPermission(user, 'read');
            }
        }
        else {
            await this.requireStaffPermission(user, 'read');
        }
        return this.support.list({ customerId, status });
    }
    transition(user, id, dto) {
        return this.support.transition(id, dto.to, dto, user.customerId);
    }
    escalate(user, id, _dto) {
        return this.support.escalate(id, user.customerId);
    }
    async requireStaffPermission(user, action) {
        if (user?.typ !== 'staff' || !user.role) {
            throw new common_1.ForbiddenException('Требуется staff JWT');
        }
        await this.staffAuth.me(user.customerId);
        if (!(await this.authz.can(user.role, 'support', action))) {
            throw new common_1.ForbiddenException('Недостаточно прав для этого действия');
        }
    }
};
exports.SupportController = SupportController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Open an idempotent ticket for the authenticated customer' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Customer-owned ticket opened or replayed.' }),
    (0, common_1.Post)('mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60_000 } }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, support_dto_1.OpenMineTicketDto]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "openMine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List tickets of the authenticated customer' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: "The current customer's tickets, SLA-first." }),
    (0, common_1.Get)('mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "mine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Open a support ticket (SLA from priority, ticket.created)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Ticket opened.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown customer.' }),
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('x-guest-capability')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [support_dto_1.OpenTicketDto, Object, String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "open", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List tickets (filter by customerId/status), SLA-first' }),
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('customerId')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], SupportController.prototype, "list", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Advance a ticket through its status machine' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Ticket transitioned.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Illegal transition.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown ticket.' }),
    (0, common_1.Patch)(':id/transition'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('support', 'transition'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, support_dto_1.TicketTransitionDto]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "transition", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Escalate a ticket one priority step (ticket.escalated)' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Ticket escalated.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Ticket closed/resolved or already at max priority.' }),
    (0, common_1.Patch)(':id/escalate'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('support', 'escalate'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, support_dto_1.EscalateTicketDto]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "escalate", null);
exports.SupportController = SupportController = __decorate([
    (0, swagger_1.ApiTags)('support'),
    (0, common_1.Controller)('support/tickets'),
    __metadata("design:paramtypes", [support_service_1.SupportService,
        staff_auth_service_1.StaffAuthService,
        authz_service_1.AuthzService])
], SupportController);
function requireIdempotencyKey(value) {
    const key = value?.trim();
    if (!key)
        throw new common_1.BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128)
        throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
    return key;
}
//# sourceMappingURL=support.controller.js.map