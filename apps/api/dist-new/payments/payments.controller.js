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
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const payments_service_1 = require("./payments.service");
const payments_dto_1 = require("./payments.dto");
const payment_intents_service_1 = require("./payment-intents.service");
const payment_intents_dto_1 = require("./payment-intents.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const optional_jwt_auth_guard_1 = require("../auth/optional-jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const config_1 = require("@nestjs/config");
const payment_gateway_provider_1 = require("./payment-gateway-provider");
const sandbox_confirm_guard_1 = require("./sandbox-confirm.guard");
const payment_methods_availability_1 = require("./payment-methods-availability");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const guest_capability_1 = require("../auth/guest-capability");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const staff_principal_1 = require("../auth/staff-principal");
const refunds_service_1 = require("../refunds/refunds.service");
let PaymentsController = class PaymentsController {
    constructor(payments, intents, staffAuth, config, gateway, refunds) {
        this.payments = payments;
        this.intents = intents;
        this.staffAuth = staffAuth;
        this.config = config;
        this.gateway = gateway;
        this.refunds = refunds;
    }
    paymentMethods() {
        return (0, payment_methods_availability_1.resolveCustomerPaymentMethods)(this.gateway.name, (name) => this.config.get(name));
    }
    async find(user, orderId, shiftId) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.payments.findForStaff(staffId, { orderId, shiftId });
    }
    async pay(user, capability, idempotencyKey, dto) {
        if ((!user || user.typ === 'customer') && dto.method !== 'gift_card') {
            throw new common_1.UnauthorizedException('payment_requires_auth');
        }
        if (user?.typ === 'customer') {
            return this.payments.payForCustomer(user.customerId, dto, user.customerId);
        }
        if (user?.typ === 'staff') {
            const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
            return this.payments.pay(dto, `staff:${staffId}`, { staffId, idempotencyKey });
        }
        const guest = (0, guest_capability_1.requireGuestCapability)(capability, 'payments:gift_card');
        return this.payments.payForCustomer(guest.sub, dto, `guest:${guest.sub}`);
    }
    async settleReceivable(user, receivableId, idempotencyKey, dto) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.payments.settleReceivable(receivableId, dto, `staff:${staffId}`, { staffId, idempotencyKey });
    }
    intent(capability, idempotencyKey, dto) {
        const guest = (0, guest_capability_1.requireGuestCapability)(capability, 'payments:intent');
        return this.intents.createForCustomer(guest.sub, dto, idempotencyKey);
    }
    customerIntent(user, idempotencyKey, dto) {
        return this.intents.createForCustomer(user.customerId, dto, idempotencyKey);
    }
    webhook(request, dto) {
        return this.intents.webhook(dto, { rawBody: request.rawBody, headers: request.headers });
    }
    async refund(user, id, idempotencyKey, dto) {
        const actor = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        if (!dto.returnId) {
            const payment = await this.payments.get(id);
            if (payment?.orderId)
                throw new common_1.BadRequestException('Товарный refund требует Return; используйте POST /returns/:returnId/refunds');
            return this.payments.refund(id, dto.amount, dto.reason, actor, undefined, {
                shiftId: dto.shiftId,
                externalReference: dto.externalReference,
                allocations: dto.allocations,
            });
        }
        if (!this.refunds)
            throw new common_1.BadRequestException('Refund aggregate service unavailable');
        return this.refunds.request(dto.returnId, { reason: dto.reason, shiftId: dto.shiftId }, actor, requireRefundIdempotencyKey(idempotencyKey));
    }
    async voidPayment(user, id, idempotencyKey, dto) {
        const actor = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.payments.voidPending(id, dto.reason, actor, requireRefundIdempotencyKey(idempotencyKey));
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Payment methods the storefront may offer (server truth)' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ online: boolean, methods: PaymentMethod[] }' }),
    (0, common_1.Get)('methods'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "paymentMethods", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List payments by order or cash shift' }),
    (0, swagger_1.ApiQuery)({ name: 'orderId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'shiftId', required: false }),
    (0, swagger_1.ApiOkResponse)({ description: 'Payments ordered by newest first.' }),
    (0, common_1.Get)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('payments', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('orderId')),
    __param(2, (0, common_1.Query)('shiftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "find", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Take payment, sell reserved units, and append ledger events',
    }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Payment received and order moved to paid.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Order is not reserved or IMEI cannot be sold.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown order or invalid payload.' }),
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('x-guest-capability')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, payments_dto_1.PayDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "pay", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Take a POS deposit against an order receivable' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Deposit recorded as a liability; draft POs may be created.' }),
    (0, common_1.Post)('receivables/:id/settle'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('payments', 'take_deposit'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, payments_dto_1.SettleOrderReceivableDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "settleReceivable", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Create an online payment intent (reserve order → awaiting_payment)',
    }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Payment provider intent created.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Order cannot be reserved or paid.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown order or amount mismatch.' }),
    (0, common_1.Post)('intents'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Headers)('x-guest-capability')),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, payment_intents_dto_1.CreatePaymentIntentDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "intent", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create an online payment intent for the authenticated customer order' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Customer-owned payment provider intent created.' }),
    (0, common_1.Post)('intents/mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, payment_intents_dto_1.CreatePaymentIntentDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "customerIntent", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Sandbox/provider webhook: confirm an online payment idempotently',
    }),
    (0, swagger_1.ApiOkResponse)({ description: 'Payment applied, or duplicate webhook deduped by txnId.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Order not payable.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown order or invalid payload.' }),
    (0, common_1.Post)('webhooks/sandbox'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(sandbox_confirm_guard_1.SandboxConfirmGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60_000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, payment_intents_dto_1.PaymentWebhookDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "webhook", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Request a refund — approval-gated (returns 202 { approvalId })',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Original payment id' }),
    (0, swagger_1.ApiAcceptedResponse)({ description: 'Refund parked for approval; not yet executed.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Payment is not refundable.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown payment or invalid amount.' }),
    (0, common_1.Post)(':id/refund'),
    (0, common_1.HttpCode)(202),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('payments', 'refund'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, payments_dto_1.RefundDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "refund", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Void an unfinished pending payment without creating a refund' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Post)(':id/void'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('payments', 'refund'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, payments_dto_1.VoidPaymentDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "voidPayment", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, swagger_1.ApiTags)('payments'),
    (0, common_1.Controller)('payments'),
    __param(4, (0, common_1.Inject)(payment_gateway_provider_1.PAYMENT_GATEWAY_PROVIDER)),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService,
        payment_intents_service_1.PaymentIntentsService,
        staff_auth_service_1.StaffAuthService,
        config_1.ConfigService, Object, refunds_service_1.RefundsService])
], PaymentsController);
function requireRefundIdempotencyKey(value) {
    const key = value?.trim();
    if (!key)
        throw new common_1.BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128)
        throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
    return key;
}
//# sourceMappingURL=payments.controller.js.map