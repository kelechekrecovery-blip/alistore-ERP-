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
exports.BankStatementController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const finance_service_1 = require("./finance.service");
const finance_dto_1 = require("./finance.dto");
let BankStatementController = class BankStatementController {
    constructor(finance) {
        this.finance = finance;
    }
    list(accountCode) {
        return this.finance.listBankStatements(accountCode);
    }
    import(user, dto) {
        return this.finance.importBankStatement(dto, user.customerId);
    }
    reconcile(user, id, dto) {
        return this.finance.reconcileBankStatementLine(id, dto, user.customerId);
    }
};
exports.BankStatementController = BankStatementController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)('accountCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BankStatementController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.ImportBankStatementDto]),
    __metadata("design:returntype", void 0)
], BankStatementController.prototype, "import", null);
__decorate([
    (0, common_1.Post)('lines/:id/reconcile'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.ReconcileBankStatementLineDto]),
    __metadata("design:returntype", void 0)
], BankStatementController.prototype, "reconcile", null);
exports.BankStatementController = BankStatementController = __decorate([
    (0, swagger_1.ApiTags)('finance'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('finance/bank-statements'),
    __metadata("design:paramtypes", [finance_service_1.FinanceService])
], BankStatementController);
//# sourceMappingURL=bank-statement.controller.js.map