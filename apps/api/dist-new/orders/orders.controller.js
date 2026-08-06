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
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const orders_service_1 = require("./orders.service");
const orders_dto_1 = require("./orders.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const staff_principal_1 = require("../auth/staff-principal");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const authz_service_1 = require("../authz/authz.service");
const guest_capability_1 = require("../auth/guest-capability");
const receipts_service_1 = require("../receipts/receipts.service");
const order_cancellations_service_1 = require("./order-cancellations.service");
const order_cancellations_dto_1 = require("./order-cancellations.dto");
const errors_1 = require("../common/errors");
const order_cancellation_resolution_service_1 = require("./order-cancellation-resolution.service");
const order_cancellation_resolution_dto_1 = require("./order-cancellation-resolution.dto");
const order_item_handover_service_1 = require("./order-item-handover.service");
const order_item_reservation_service_1 = require("./order-item-reservation.service");
let OrdersController = class OrdersController {
    constructor(orders, staffAuth, authz, receipts, cancellations, cancellationResolutions, itemHandovers, itemReservations) {
        this.orders = orders;
        this.staffAuth = staffAuth;
        this.authz = authz;
        this.receipts = receipts;
        this.cancellations = cancellations;
        this.cancellationResolutions = cancellationResolutions;
        this.itemHandovers = itemHandovers;
        this.itemReservations = itemReservations;
    }
    async reserveItem(user, id, itemId, key) {
        return this.itemReservations.reserve(id, itemId, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth), key ?? '');
    }
    async readyItem(user, id, itemId, key) {
        return this.itemReservations.ready(id, itemId, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth), key ?? '');
    }
    async handOverItem(user, id, itemId, idempotencyKey) {
        const actor = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.itemHandovers.handOver(id, itemId, actor, idempotencyKey ?? '');
    }
    mine(user) {
        return this.orders.listByCustomer(user.customerId);
    }
    async cancellationPreview(user, id) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Доступно только покупателю');
        const preview = await this.cancellations.preview(id, user.customerId);
        if (!preview)
            throw new common_1.NotFoundException(`Заказ ${id} не найден`);
        return preview;
    }
    async requestCancellation(user, id, idempotencyKey, dto) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Доступно только покупателю');
        const key = idempotencyKey?.trim();
        if (!key || key.length > 128) {
            throw new errors_1.ValidationError('idempotency_key_required', 'Требуется Idempotency-Key длиной до 128 символов');
        }
        return this.cancellations.request(id, user.customerId, dto.reason, key);
    }
    async currentCancellation(user, id) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Доступно только покупателю');
        const order = await this.orders.getForCustomer(id, user.customerId);
        if (!order)
            throw new common_1.NotFoundException(`Заказ ${id} не найден`);
        return this.cancellations.current(id, user.customerId);
    }
    async cancellationOwnerPreview(user, id, cancellationId) {
        await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        const preview = await this.cancellationResolutions.preview(id, cancellationId, user.role);
        if (!preview)
            throw new common_1.NotFoundException(`Заявка отмены ${cancellationId} не найдена`);
        return preview;
    }
    async resolveCancellationAsOwner(user, id, cancellationId, idempotencyKey, dto) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        const key = idempotencyKey?.trim();
        if (!key || key.length > 128) {
            throw new errors_1.ValidationError('idempotency_key_required', 'Требуется Idempotency-Key длиной до 128 символов');
        }
        const { totpToken, ...decision } = dto;
        return this.cancellationResolutions.resolve(id, cancellationId, staffId, user.role, decision, key, totpToken);
    }
    createMine(user, idempotencyKey, dto) {
        requireStorefrontConsent(dto.piiConsent);
        return this.orders.createFromCatalog({
            ...dto,
            customerId: user.customerId,
            channel: dto.channel === 'web' ? 'web' : dto.channel === 'telegram' ? 'telegram' : 'mobile',
        }, user.customerId, idempotencyKey, true);
    }
    async queue(user, status) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.orders.listByStatusForStaff((status ?? 'created'), staffId);
    }
    async ledger(user, id) {
        const order = await this.orders.get(id);
        if (!order)
            throw new common_1.NotFoundException(`Заказ ${id} не найден`);
        if (user.typ === 'customer') {
            if (order.customerId !== user.customerId) {
                throw new common_1.NotFoundException(`Заказ ${id} не найден`);
            }
        }
        else {
            const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
            if (!user.role || !(await this.authz.can(user.role, 'orders', 'queue'))) {
                throw new common_1.ForbiddenException('Недостаточно прав для просмотра заказа');
            }
            if (await this.orders.isOwnOpenShiftOrder(id, staffId)) {
                throw new common_1.ForbiddenException('Леджер кассового заказа доступен после закрытия смены');
            }
            return this.orders.ledger(id);
        }
        return this.orders.customerLedger(id);
    }
    async get(user, id) {
        if (user.typ === 'customer') {
            const customerOrder = await this.orders.getForCustomer(id, user.customerId);
            if (!customerOrder)
                throw new common_1.NotFoundException(`Заказ ${id} не найден`);
            return customerOrder;
        }
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        if (!user.role || !(await this.authz.can(user.role, 'orders', 'queue'))) {
            throw new common_1.ForbiddenException('Недостаточно прав для просмотра заказа');
        }
        const staffOrder = await this.orders.getForStaff(id, staffId);
        if (!staffOrder)
            throw new common_1.NotFoundException(`Заказ ${id} не найден`);
        return staffOrder;
    }
    async customerReceipt(user, id) {
        const order = await this.orders.get(id);
        if (!order)
            throw new common_1.NotFoundException(`Заказ ${id} не найден`);
        if (user.typ !== 'customer' || order.customerId !== user.customerId) {
            throw new common_1.NotFoundException(`Заказ ${id} не найден`);
        }
        const paid = order.payments.some((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status));
        if (!paid)
            throw new common_1.ConflictException('receipt_not_available');
        const receipt = await this.receipts.renderOrder(id);
        return { markup: receipt.markup };
    }
    async guestOrder(capability, id) {
        const claims = (0, guest_capability_1.requireGuestCapability)(capability, 'orders:read', undefined, { type: 'order', id });
        const order = await this.orders.getGuest(id);
        if (!order || order.customerId !== claims.sub)
            throw new common_1.NotFoundException(`Заказ ${id} не найден`);
        const ledger = await this.orders.ledger(id);
        const { customerId: _, ...safeOrder } = order;
        return {
            order: safeOrder,
            timeline: ledger.map((event) => ({ type: event.type, ts: event.ts })),
        };
    }
    async guestReceipt(capability, id) {
        const claims = (0, guest_capability_1.requireGuestCapability)(capability, 'receipts:read', undefined, { type: 'order', id });
        const order = await this.orders.get(id);
        if (!order || order.customerId !== claims.sub)
            throw new common_1.NotFoundException(`Заказ ${id} не найден`);
        const paid = order.payments.some((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status));
        if (!paid)
            throw new common_1.ConflictException('receipt_not_available');
        const receipt = await this.receipts.renderOrder(id);
        return { markup: receipt.markup };
    }
    async create(capability, idempotencyKey, dto) {
        requireStorefrontConsent(dto.piiConsent);
        const guest = (0, guest_capability_1.requireGuestCapability)(capability, 'orders:create', dto.customerId);
        const order = await this.orders.createFromCatalog(dto, `guest:${guest.sub}`, idempotencyKey, false);
        const expiresIn = (0, guest_capability_1.guestOrderCapabilityTtlSeconds)();
        return {
            ...order,
            guestAccess: {
                capability: (0, guest_capability_1.issueGuestOrderCapability)(order.customerId, order.id, expiresIn),
                expiresIn,
            },
        };
    }
    async reserve(user, id) {
        return this.orders.reserve(id, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async fulfill(user, id) {
        return this.orders.fulfill(id, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async transition(user, id, dto) {
        const staffId = await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        if (user.role === 'courier') {
            throw new common_1.ForbiddenException('Курьер меняет доставку только через courier endpoints с COD и idempotency');
        }
        return this.orders.transition(id, dto.to, staffId);
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Post)(':id/items/:itemId/reserve'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('orders', 'fulfill'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('itemId')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "reserveItem", null);
__decorate([
    (0, common_1.Post)(':id/items/:itemId/ready'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('orders', 'fulfill'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('itemId')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "readyItem", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Hand over one paid own-stock line of a pickup order' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: 'The line inventory and revenue are finalized exactly once.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Line is unpaid, not ready, already handed over, or supplier-backed.' }),
    (0, common_1.Post)(':id/items/:itemId/handover'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('orders', 'fulfill'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('itemId')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "handOverItem", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Orders of the authenticated customer (personal account)' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: "The current customer's orders, newest first." }),
    (0, common_1.Get)('mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "mine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Preview cancellation and deposit refund policy for a customer order' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Customer-owned order id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Cancellation eligibility and estimated refund.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Order does not exist or belongs to another customer.' }),
    (0, common_1.Get)('mine/:id/cancellation-preview'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "cancellationPreview", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Request cancellation of a customer-owned supply order' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Cancellation request created or idempotently replayed.' }),
    (0, common_1.Post)('mine/:id/cancellations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, order_cancellations_dto_1.CreateOrderCancellationDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "requestCancellation", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Read the latest cancellation request for a customer-owned order' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Latest cancellation request or null.' }),
    (0, common_1.Get)('mine/:id/cancellations/current'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "currentCancellation", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Preview an owner/admin decision for a post-PO cancellation' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Immutable cancellation snapshot and resolution policy.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Cancellation does not exist for this order.' }),
    (0, common_1.Get)(':id/cancellations/:cancellationId/owner-preview'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('approvals', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('cancellationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "cancellationOwnerPreview", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Resolve a post-PO cancellation with owner/admin TOTP step-up',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Decision recorded; approved refund queued idempotently.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Cancellation already resolved or refund already exists.' }),
    (0, common_1.Post)(':id/cancellations/:cancellationId/owner-resolution'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('approvals', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('cancellationId')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __param(4, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, order_cancellation_resolution_dto_1.ResolveOrderCancellationDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "resolveCancellationAsOwner", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create an order for the authenticated customer' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Customer-owned order created.' }),
    (0, common_1.Post)('mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, orders_dto_1.CreateMyOrderDto]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "createMine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List orders by status — staff fulfillment queue' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Orders in the given status, newest first.' }),
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('orders', 'queue'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "queue", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Order Event Ledger timeline — customer owner or staff queue read' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Order id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Ledger events for the order, newest first.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Order does not exist or is not visible to this user.' }),
    (0, common_1.Get)(':id/ledger'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "ledger", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get an order with items and payments' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Order id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Order found.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Order does not exist.' }),
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "get", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Render a paid receipt for the authenticated customer' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Customer-owned order id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Receipt markup for the paid order.' }),
    (0, common_1.Get)(':id/receipt'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "customerReceipt", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Read one guest order through an order-scoped capability' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Order id bound into the capability' }),
    (0, common_1.Get)(':id/guest'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60_000 } }),
    __param(0, (0, common_1.Headers)('x-guest-capability')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "guestOrder", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Read a guest receipt through an order-scoped capability' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Order id bound into the capability' }),
    (0, common_1.Get)(':id/guest-receipt'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    __param(0, (0, common_1.Headers)('x-guest-capability')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "guestReceipt", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Create an order and append order.created to the Event Ledger',
    }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Order created.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Invalid order payload.' }),
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Headers)('x-guest-capability')),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, orders_dto_1.CreateOrderDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Reserve IMEI stock for an order and append reservation events',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Order id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Order moved to reserved.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'IMEI is unavailable or already sold.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown order or illegal state.' }),
    (0, common_1.Post)(':id/reserve'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('orders', 'reserve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "reserve", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Warehouse fulfillment: assign IMEI units to a web order → reserved',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Order id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Units assigned; order moved to reserved.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Insufficient stock for a line.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown order or illegal state.' }),
    (0, common_1.Post)(':id/fulfill'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('orders', 'fulfill'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "fulfill", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Move an order through the guarded state machine',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Order id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Order status updated.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Illegal transition.' }),
    (0, common_1.Post)(':id/transition'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('orders', 'transition'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, orders_dto_1.TransitionDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "transition", null);
exports.OrdersController = OrdersController = __decorate([
    (0, swagger_1.ApiTags)('orders'),
    (0, common_1.Controller)('orders'),
    __metadata("design:paramtypes", [orders_service_1.OrdersService,
        staff_auth_service_1.StaffAuthService,
        authz_service_1.AuthzService,
        receipts_service_1.ReceiptsService,
        order_cancellations_service_1.OrderCancellationsService,
        order_cancellation_resolution_service_1.OrderCancellationResolutionService,
        order_item_handover_service_1.OrderItemHandoverService,
        order_item_reservation_service_1.OrderItemReservationService])
], OrdersController);
function requireStorefrontConsent(consent) {
    if (consent === true)
        return;
    throw new errors_1.ValidationError('checkout_consent_required', 'Подтвердите согласие с условиями обработки персональных данных');
}
//# sourceMappingURL=orders.controller.js.map