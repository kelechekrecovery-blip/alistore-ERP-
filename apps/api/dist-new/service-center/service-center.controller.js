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
exports.ServiceCenterController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const service_center_dto_1 = require("./service-center.dto");
const service_center_service_1 = require("./service-center.service");
const service_execution_service_1 = require("./service-execution.service");
const service_loaner_service_1 = require("./service-loaner.service");
let ServiceCenterController = class ServiceCenterController {
    constructor(serviceCenter, execution, loaners) {
        this.serviceCenter = serviceCenter;
        this.execution = execution;
        this.loaners = loaners;
    }
    loanerFund(user) { return this.loaners.list(user.customerId); }
    registerLoaner(user, key, dto) {
        return this.loaners.register(dto, user.customerId, key);
    }
    prepareLoaner(user, id, key, dto) {
        return this.loaners.prepare(id, dto, user.customerId, key);
    }
    issueLoaner(user, id, key) {
        return this.loaners.issue(id, user.customerId, key);
    }
    cancelLoaner(user, id, key) {
        return this.loaners.cancel(id, user.customerId, key);
    }
    returnLoaner(user, id, key, dto) {
        return this.loaners.returnLoan(id, dto, user.customerId, key);
    }
    resolveLoanerDispute(user, id, key, dto) {
        return this.loaners.resolveDispute(id, dto.disposition, user.customerId, key);
    }
    queue(user) { return this.serviceCenter.queue(user.customerId); }
    create(user, key, dto) { return this.serviceCenter.create(dto, user.customerId, key); }
    createPaidRepair(user, key, dto) { return this.serviceCenter.createPaidRepair(dto, user.customerId, key); }
    assign(user, id, key, dto) { return this.serviceCenter.assign(id, dto, user.customerId, key); }
    diagnose(user, id, key, dto) { return this.serviceCenter.diagnose(id, dto, user.customerId, key); }
    reservePart(user, id, key, dto) { return this.execution.reservePart(id, dto, user.customerId, key); }
    releasePart(user, id, partId, key) { return this.execution.releasePart(id, partId, user.customerId, key); }
    consumePart(user, id, partId, key) { return this.execution.consumePart(id, partId, user.customerId, key); }
    start(user, id, key) { return this.execution.start(id, user.customerId, key); }
    complete(user, id, key, dto) { return this.execution.complete(id, dto, user.customerId, key); }
    replace(user, id, key, dto) { return this.execution.replace(id, dto, user.customerId, key); }
    close(user, id, key) { return this.execution.close(id, user.customerId, key); }
    paymentContext(user, id) {
        return this.serviceCenter.paymentContext(id, user.customerId);
    }
    pay(user, id, key, dto) { return this.serviceCenter.pay(id, dto, user.customerId, key); }
    mine(user) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Доступно только клиенту');
        return this.serviceCenter.mine(user.customerId);
    }
    myLoaners(user) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Доступно только клиенту');
        return this.loaners.mine(user.customerId);
    }
    approveEstimate(user, id, key) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Смету подтверждает клиент');
        return this.serviceCenter.approveEstimate(id, user.customerId, key);
    }
};
exports.ServiceCenterController = ServiceCenterController;
__decorate([
    (0, common_1.Get)('loaners'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "loanerFund", null);
__decorate([
    (0, common_1.Post)('loaners/register'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'loaners_manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, service_center_dto_1.RegisterLoanerDeviceDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "registerLoaner", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/loaner/prepare'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'loaners_issue'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, service_center_dto_1.PrepareLoanerLoanDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "prepareLoaner", null);
__decorate([
    (0, common_1.Post)('loaner-loans/:id/issue'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'loaners_issue'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "issueLoaner", null);
__decorate([
    (0, common_1.Post)('loaner-loans/:id/cancel'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'loaners_issue'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "cancelLoaner", null);
__decorate([
    (0, common_1.Post)('loaner-loans/:id/return'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'loaners_issue'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, service_center_dto_1.ReturnLoanerLoanDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "returnLoaner", null);
__decorate([
    (0, common_1.Post)('loaner-loans/:id/resolve-dispute'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'loaners_manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, service_center_dto_1.ResolveLoanerDisputeDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "resolveLoanerDispute", null);
__decorate([
    (0, common_1.Get)('queue'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "queue", null);
__decorate([
    (0, common_1.Post)('work-orders'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'intake'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, service_center_dto_1.CreateServiceWorkOrderDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('paid-repairs'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'intake'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, service_center_dto_1.CreatePaidRepairDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "createPaidRepair", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/assign'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'assign'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, service_center_dto_1.AssignServiceTechnicianDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "assign", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/diagnose'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'diagnose'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, service_center_dto_1.DiagnoseServiceWorkOrderDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "diagnose", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/parts'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'parts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, service_center_dto_1.ReserveServicePartDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "reservePart", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/parts/:partId/release'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'parts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('partId')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "releasePart", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/parts/:partId/consume'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'execute'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('partId')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "consumePart", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/start'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'execute'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "start", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/complete'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'execute'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, service_center_dto_1.CompleteServiceRepairDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "complete", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/replace'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'execute'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, service_center_dto_1.ReplaceServiceDeviceDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "replace", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/close'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('service_center', 'execute'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "close", null);
__decorate([
    (0, common_1.Get)('work-orders/:id/payment-context'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('payments', 'take_service'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "paymentContext", null);
__decorate([
    (0, common_1.Post)('work-orders/:id/pay'),
    (0, common_1.UseGuards)(active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('payments', 'take_service'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, service_center_dto_1.PayServiceWorkOrderDto]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "pay", null);
__decorate([
    (0, common_1.Get)('me/work-orders'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)('me/loaners'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "myLoaners", null);
__decorate([
    (0, common_1.Post)('me/work-orders/:id/approve-estimate'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ServiceCenterController.prototype, "approveEstimate", null);
exports.ServiceCenterController = ServiceCenterController = __decorate([
    (0, swagger_1.ApiTags)('service-center'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('service-center'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [service_center_service_1.ServiceCenterService,
        service_execution_service_1.ServiceExecutionService,
        service_loaner_service_1.ServiceLoanerService])
], ServiceCenterController);
//# sourceMappingURL=service-center.controller.js.map