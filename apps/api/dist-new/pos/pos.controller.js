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
exports.PosController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const pos_service_1 = require("./pos.service");
const pos_dto_1 = require("./pos.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const staff_principal_1 = require("../auth/staff-principal");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
let PosController = class PosController {
    constructor(pos, staffAuth) {
        this.pos = pos;
        this.staffAuth = staffAuth;
    }
    async customer(user, dto) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.pos.findCustomer(dto.phone, staffId, dto.point, dto.clientSaleId);
    }
    async sale(user, dto, res) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        const result = await this.pos.sale({ ...dto, staffId });
        if (result.pendingApproval)
            res.status(common_1.HttpStatus.ACCEPTED);
        return result;
    }
};
exports.PosController = PosController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Find an existing customer by exact phone for a counter sale' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Post)('customers/lookup'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    (0, require_permission_decorator_1.RequirePermission)('pos', 'sale'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pos_dto_1.PosCustomerLookupDto]),
    __metadata("design:returntype", Promise)
], PosController.prototype, "customer", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Complete a counter sale: customer→shift→assign IMEIs→order→reserve→pay',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Sale completed; order paid, units sold, ledger written.' }),
    (0, swagger_1.ApiAcceptedResponse)({ description: 'Discount or margin breach — parked for approval (202 { approvalId }).' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Insufficient stock for a line.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Invalid sale payload.' }),
    (0, common_1.Post)('sale'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('pos', 'sale'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, pos_dto_1.PosSaleDto, Object]),
    __metadata("design:returntype", Promise)
], PosController.prototype, "sale", null);
exports.PosController = PosController = __decorate([
    (0, swagger_1.ApiTags)('pos'),
    (0, common_1.Controller)('pos'),
    __metadata("design:paramtypes", [pos_service_1.PosService,
        staff_auth_service_1.StaffAuthService])
], PosController);
//# sourceMappingURL=pos.controller.js.map