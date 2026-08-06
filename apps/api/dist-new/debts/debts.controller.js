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
exports.DebtsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const debts_service_1 = require("./debts.service");
const debts_dto_1 = require("./debts.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let DebtsController = class DebtsController {
    constructor(debts) {
        this.debts = debts;
    }
    create(user, dto) {
        return this.debts.create(dto, user.customerId);
    }
    list(customerId, status) {
        return this.debts.list({ customerId, status });
    }
    pay(user, id, dto) {
        return this.debts.pay(id, dto, user.customerId);
    }
};
exports.DebtsController = DebtsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Book a debt/installment sale — over the limit returns 202 { approvalId }' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Debt booked (within limit).' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown order.' }),
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('debts', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, debts_dto_1.CreateDebtDto]),
    __metadata("design:returntype", void 0)
], DebtsController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List debts (filter by customerId/status)' }),
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('debts', 'read'),
    __param(0, (0, common_1.Query)('customerId')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], DebtsController.prototype, "list", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Record a payment against a debt (settles at zero balance)' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Payment recorded; balance reduced.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Debt not open.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown debt or invalid amount.' }),
    (0, common_1.Post)(':id/payments'),
    (0, require_permission_decorator_1.RequirePermission)('debts', 'pay'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, debts_dto_1.DebtPaymentDto]),
    __metadata("design:returntype", void 0)
], DebtsController.prototype, "pay", null);
exports.DebtsController = DebtsController = __decorate([
    (0, swagger_1.ApiTags)('debts'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('debts'),
    __metadata("design:paramtypes", [debts_service_1.DebtsService])
], DebtsController);
//# sourceMappingURL=debts.controller.js.map