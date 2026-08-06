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
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const reports_service_1 = require("./reports.service");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const staff_principal_1 = require("../auth/staff-principal");
const blind_cash_read_guard_1 = require("../auth/blind-cash-read.guard");
const analytics_service_1 = require("../analytics/analytics.service");
const errors_1 = require("../common/errors");
const FUNNEL_DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
let ReportsController = class ReportsController {
    constructor(reports, staffAuth, analytics) {
        this.reports = reports;
        this.staffAuth = staffAuth;
        this.analytics = analytics;
    }
    async dashboard(user) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.reports.dashboard(staffId);
    }
    kpi() {
        return this.reports.kpi();
    }
    revenue(days) {
        return this.reports.revenue(days ? Number(days) : 7);
    }
    revenueRange(from, to) {
        return this.reports.revenueRange(from, to);
    }
    revenueTrend(days) {
        return this.reports.revenueTrend(days ? Number(days) : 7);
    }
    payroll() {
        return this.reports.payroll();
    }
    risks() {
        return this.reports.risks();
    }
    ledger(type, ref) {
        return this.reports.ledger({ type, ref });
    }
    zReport(date) {
        return this.reports.zReport(date);
    }
    funnel(from, to) {
        const toDate = to ? new Date(to) : new Date();
        const fromDate = from ? new Date(from) : new Date(toDate.getTime() - FUNNEL_DEFAULT_WINDOW_MS);
        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
            throw new errors_1.ValidationError('invalid_date_range', 'Некорректный диапазон дат воронки');
        }
        return this.analytics.funnel(fromDate, toDate);
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Owner dashboard KPIs (money, orders, stock, ops)' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Aggregated metrics from the Event Ledger tables.' }),
    (0, common_1.Get)('dashboard'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "dashboard", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Owner KPIs — gross margin, average check, top products' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Margin/COGS/avg-check derived from ledger-backed tables.' }),
    (0, common_1.Get)('kpi'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "kpi", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Daily revenue buckets for the last N days (default 7, max 90)' }),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false, example: 30 }),
    (0, swagger_1.ApiOkResponse)({ description: 'One {day, amount} bucket per day, oldest first.' }),
    (0, common_1.Get)('revenue'),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "revenue", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Revenue for an arbitrary date range (from & to, YYYY-MM-DD, inclusive)' }),
    (0, swagger_1.ApiQuery)({ name: 'from', required: true, example: '2026-06-01' }),
    (0, swagger_1.ApiQuery)({ name: 'to', required: true, example: '2026-06-30' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ from, to, days, total, buckets[] }.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Invalid date/range.' }),
    (0, common_1.Get)('revenue-range'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "revenueRange", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Revenue trend — last N days vs the previous N days (default 7)' }),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false, example: 30 }),
    (0, swagger_1.ApiOkResponse)({ description: '{ current, previous, deltaPct, direction }.' }),
    (0, common_1.Get)('revenue-trend'),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "revenueTrend", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Seller payroll — base + commission on turnover, per seller' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Advisory pay per seller from ledger-backed payments.' }),
    (0, common_1.Get)('payroll'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "payroll", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Risk Center — ranked risk signals' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Discrepancies, outstanding COD, stale reservations, approvals.' }),
    (0, common_1.Get)('risks'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "risks", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Event Ledger feed (read-only)' }),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'ref', required: false }),
    (0, swagger_1.ApiOkResponse)({ description: 'Latest audit events, newest first.' }),
    (0, common_1.Get)('ledger'),
    __param(0, (0, common_1.Query)('type')),
    __param(1, (0, common_1.Query)('ref')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "ledger", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Z-report — daily till summary (shifts, sales by method, variance)' }),
    (0, swagger_1.ApiQuery)({ name: 'date', required: true, example: '2026-07-24' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ date, shifts[], totals }.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Invalid date.' }),
    (0, common_1.Get)('z-report'),
    __param(0, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "zReport", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Storefront funnel — views → carts → checkouts for a period' }),
    (0, swagger_1.ApiQuery)({ name: 'from', required: false, description: 'ISO datetime; default 30 days ago' }),
    (0, swagger_1.ApiQuery)({ name: 'to', required: false, description: 'ISO datetime; default now' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ from, to, productViews, addToCarts, checkoutsStarted }.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Invalid date/range.' }),
    (0, common_1.Get)('funnel'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "funnel", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('reports'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, blind_cash_read_guard_1.BlindCashReadGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('reports', 'read'),
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        staff_auth_service_1.StaffAuthService,
        analytics_service_1.AnalyticsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map