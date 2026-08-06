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
exports.FinancePlanningController = exports.FinanceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const blind_cash_read_guard_1 = require("../auth/blind-cash-read.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const finance_dto_1 = require("./finance.dto");
const finance_service_1 = require("./finance.service");
let FinanceController = class FinanceController {
    constructor(finance) {
        this.finance = finance;
    }
    list(status) {
        return this.finance.list(status);
    }
    create(user, dto) {
        return this.finance.create(dto, user.customerId);
    }
    approve(user, id) {
        return this.finance.approve(id, user.customerId);
    }
    reject(user, id, dto) {
        return this.finance.reject(id, dto.note, user.customerId);
    }
    pay(user, id, dto) {
        return this.finance.pay(id, dto, user.customerId);
    }
};
exports.FinanceController = FinanceController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.CreateExpenseDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.RejectExpenseDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)(':id/pay'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'pay'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.PayExpenseDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "pay", null);
exports.FinanceController = FinanceController = __decorate([
    (0, swagger_1.ApiTags)('finance'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('finance/expenses'),
    __metadata("design:paramtypes", [finance_service_1.FinanceService])
], FinanceController);
let FinancePlanningController = class FinancePlanningController {
    constructor(finance) {
        this.finance = finance;
    }
    accounts() {
        return this.finance.listAccountingAccounts();
    }
    currencyRates(query) {
        return this.finance.listCurrencyRates(query);
    }
    fxExposure(query) {
        return this.finance.fxExposure(query);
    }
    createCurrencyRate(user, dto) {
        return this.finance.createCurrencyRate(dto, user.customerId);
    }
    collectableShifts(point) {
        return this.finance.collectableShifts(point?.trim() || undefined);
    }
    cashIncassations(point) {
        return this.finance.listCashIncassations(point);
    }
    cashIncassation(user, shiftId, idempotencyKey, dto) {
        if (!idempotencyKey?.trim())
            throw new common_1.BadRequestException('Требуется Idempotency-Key');
        return this.finance.createCashIncassation(shiftId, dto, user.customerId, idempotencyKey.trim());
    }
    periods() {
        return this.finance.listAccountingPeriods();
    }
    periodReadiness(period) {
        return this.finance.accountingPeriodReadiness(period);
    }
    openingBalances() {
        return this.finance.listOpeningBalances();
    }
    openingBalance(user, dto) {
        return this.finance.createOpeningBalance(dto, user.customerId);
    }
    fixedAssets() {
        return this.finance.listFixedAssets();
    }
    createFixedAsset(user, dto) {
        return this.finance.createFixedAsset(dto, user.customerId);
    }
    depreciateFixedAsset(user, id, dto) {
        return this.finance.depreciateFixedAsset(id, dto, user.customerId);
    }
    accountableAdvances(query) {
        return this.finance.listAccountableAdvances(query);
    }
    createAccountableAdvance(user, dto) {
        return this.finance.createAccountableAdvance(dto, user.customerId);
    }
    settleAccountableAdvance(user, id, dto) {
        return this.finance.settleAccountableAdvance(id, dto, user.customerId);
    }
    returnAccountableAdvance(user, id, dto) {
        return this.finance.returnAccountableAdvance(id, dto, user.customerId);
    }
    reimburseAccountableAdvance(user, id, dto) {
        return this.finance.reimburseAccountableAdvance(id, dto, user.customerId);
    }
    closePeriod(user, period, dto) {
        return this.finance.closeAccountingPeriod(period, dto, user.customerId);
    }
    taxPeriod(period, point) {
        return this.finance.taxPeriod(period, point);
    }
    settleTaxPeriod(user, period, dto) {
        return this.finance.settleTaxPeriod(period, dto, user.customerId);
    }
    apAging(query) {
        return this.finance.supplierAging(query);
    }
    arAging(query) {
        return this.finance.customerAging(query);
    }
    arAgingDocument(id, query) {
        return this.finance.customerDebtDrilldown(id, query);
    }
    journal(query) {
        return this.finance.accountingJournal(query);
    }
    manualAdjustments(status) {
        return this.finance.listManualAdjustments(status);
    }
    manualAdjustment(user, dto) {
        return this.finance.createManualAdjustment(dto, user.customerId);
    }
    async journalExport(query, response) {
        const csv = await this.finance.accountingJournalExport(query);
        return response
            .status(200)
            .type('text/csv; charset=utf-8')
            .setHeader('Content-Disposition', 'attachment; filename="alistore-journal.csv"')
            .send(`\uFEFF${csv}`);
    }
    reverseJournal(user, id, dto) {
        return this.finance.reverseAccountingEntry(id, dto, user.customerId);
    }
    trialBalance(query) {
        return this.finance.trialBalance(query);
    }
    statements(query) {
        return this.finance.financialStatements(query);
    }
    budgets(query) {
        return this.finance.listBudgets(query.period, query.point);
    }
    setBudget(user, dto) {
        return this.finance.setBudget(dto, user.customerId);
    }
    planFact(query) {
        return this.finance.planFact(query.period, query.point);
    }
    settlementSources(query) {
        return this.finance.settlementSources(query);
    }
    settlements() {
        return this.finance.listSettlements();
    }
    createSettlement(user, dto) {
        return this.finance.createSettlement(dto, user.customerId);
    }
    resolveSettlement(user, id, dto) {
        return this.finance.resolveSettlement(id, dto, user.customerId);
    }
    closeSettlement(user, id, dto) {
        return this.finance.closeSettlement(id, dto.idempotencyKey, user.customerId);
    }
};
exports.FinancePlanningController = FinancePlanningController;
__decorate([
    (0, common_1.Get)('accounts'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "accounts", null);
__decorate([
    (0, common_1.Get)('currency-rates'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.CurrencyRateQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "currencyRates", null);
__decorate([
    (0, common_1.Get)('fx-exposure'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.FxExposureQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "fxExposure", null);
__decorate([
    (0, common_1.Post)('currency-rates'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.CreateCurrencyRateDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "createCurrencyRate", null);
__decorate([
    (0, common_1.Get)('collectable-shifts'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)('point')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "collectableShifts", null);
__decorate([
    (0, common_1.Get)('cash-incassations'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)('point')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "cashIncassations", null);
__decorate([
    (0, common_1.Post)('cash-incassations/:shiftId'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('shiftId')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, finance_dto_1.CreateCashIncassationDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "cashIncassation", null);
__decorate([
    (0, common_1.Get)('periods'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "periods", null);
__decorate([
    (0, common_1.Get)('periods/:period/readiness'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Param)('period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "periodReadiness", null);
__decorate([
    (0, common_1.Get)('opening-balances'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "openingBalances", null);
__decorate([
    (0, common_1.Post)('opening-balances'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.CreateOpeningBalanceDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "openingBalance", null);
__decorate([
    (0, common_1.Get)('fixed-assets'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "fixedAssets", null);
__decorate([
    (0, common_1.Post)('fixed-assets'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.CreateFixedAssetDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "createFixedAsset", null);
__decorate([
    (0, common_1.Post)('fixed-assets/:id/depreciation'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.DepreciateFixedAssetDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "depreciateFixedAsset", null);
__decorate([
    (0, common_1.Get)('accountable-advances'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.AccountableAdvanceQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "accountableAdvances", null);
__decorate([
    (0, common_1.Post)('accountable-advances'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'pay'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.CreateAccountableAdvanceDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "createAccountableAdvance", null);
__decorate([
    (0, common_1.Post)('accountable-advances/:id/settle'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.SettleAccountableAdvanceDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "settleAccountableAdvance", null);
__decorate([
    (0, common_1.Post)('accountable-advances/:id/return'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'pay'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.CloseAccountableAdvanceDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "returnAccountableAdvance", null);
__decorate([
    (0, common_1.Post)('accountable-advances/:id/reimburse'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'pay'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.CloseAccountableAdvanceDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "reimburseAccountableAdvance", null);
__decorate([
    (0, common_1.Post)('periods/:period/close'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('period')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.CloseAccountingPeriodDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "closePeriod", null);
__decorate([
    (0, common_1.Get)('tax-periods/:period'),
    (0, common_1.UseGuards)(blind_cash_read_guard_1.BlindCashReadGuard),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Param)('period')),
    __param(1, (0, common_1.Query)('point')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "taxPeriod", null);
__decorate([
    (0, common_1.Post)('tax-periods/:period/settle'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('period')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.SettleTaxPeriodDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "settleTaxPeriod", null);
__decorate([
    (0, common_1.Get)('ap-aging'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.SupplierAgingQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "apAging", null);
__decorate([
    (0, common_1.Get)('ar-aging'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.ArAgingQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "arAging", null);
__decorate([
    (0, common_1.Get)('ar-aging/:id'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, finance_dto_1.ArAgingQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "arAgingDocument", null);
__decorate([
    (0, common_1.Get)('journal'),
    (0, common_1.UseGuards)(blind_cash_read_guard_1.BlindCashReadGuard),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.FinanceAccountingQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "journal", null);
__decorate([
    (0, common_1.Get)('manual-adjustments'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "manualAdjustments", null);
__decorate([
    (0, common_1.Post)('manual-adjustments'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.CreateManualAdjustmentDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "manualAdjustment", null);
__decorate([
    (0, common_1.Get)('journal/export'),
    (0, common_1.UseGuards)(blind_cash_read_guard_1.BlindCashReadGuard),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.FinanceAccountingQueryDto, Object]),
    __metadata("design:returntype", Promise)
], FinancePlanningController.prototype, "journalExport", null);
__decorate([
    (0, common_1.Post)('journal/:id/reverse'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.ReverseAccountingEntryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "reverseJournal", null);
__decorate([
    (0, common_1.Get)('trial-balance'),
    (0, common_1.UseGuards)(blind_cash_read_guard_1.BlindCashReadGuard),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.FinanceAccountingQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "trialBalance", null);
__decorate([
    (0, common_1.Get)('statements'),
    (0, common_1.UseGuards)(blind_cash_read_guard_1.BlindCashReadGuard),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.FinanceAccountingQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "statements", null);
__decorate([
    (0, common_1.Get)('budgets'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.FinancePeriodQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "budgets", null);
__decorate([
    (0, common_1.Post)('budgets'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.SetFinanceBudgetDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "setBudget", null);
__decorate([
    (0, common_1.Get)('plan-fact'),
    (0, common_1.UseGuards)(blind_cash_read_guard_1.BlindCashReadGuard),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.FinancePeriodQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "planFact", null);
__decorate([
    (0, common_1.Get)('settlement-sources'),
    (0, common_1.UseGuards)(blind_cash_read_guard_1.BlindCashReadGuard),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finance_dto_1.FinanceSettlementQueryDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "settlementSources", null);
__decorate([
    (0, common_1.Get)('settlements'),
    (0, common_1.UseGuards)(blind_cash_read_guard_1.BlindCashReadGuard),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "settlements", null);
__decorate([
    (0, common_1.Post)('settlements'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_dto_1.CreateFinanceSettlementDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "createSettlement", null);
__decorate([
    (0, common_1.Post)('settlements/:id/resolve'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.ResolveFinanceSettlementDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "resolveSettlement", null);
__decorate([
    (0, common_1.Post)('settlements/:id/close'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'pay'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, finance_dto_1.CloseFinanceSettlementDto]),
    __metadata("design:returntype", void 0)
], FinancePlanningController.prototype, "closeSettlement", null);
exports.FinancePlanningController = FinancePlanningController = __decorate([
    (0, swagger_1.ApiTags)('finance'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('finance'),
    __metadata("design:paramtypes", [finance_service_1.FinanceService])
], FinancePlanningController);
//# sourceMappingURL=finance.controller.js.map