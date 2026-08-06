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
exports.CustomersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const errors_1 = require("../common/errors");
const customers_service_1 = require("./customers.service");
const customers_dto_1 = require("./customers.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const guest_capability_1 = require("../auth/guest-capability");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const authz_service_1 = require("../authz/authz.service");
let CustomersController = class CustomersController {
    constructor(customers, staffAuth, authz) {
        this.customers = customers;
        this.staffAuth = staffAuth;
        this.authz = authz;
    }
    loyalty(user) {
        this.assertCustomer(user);
        return this.customers.loyalty(user.customerId);
    }
    addresses(user) {
        this.assertCustomer(user);
        return this.customers.addresses(user.customerId);
    }
    createAddress(user, idempotencyKey, dto) {
        this.assertCustomer(user);
        return this.customers.createAddress(user.customerId, dto, requireIdempotencyKey(idempotencyKey));
    }
    updateAddress(user, addressId, dto) {
        this.assertCustomer(user);
        return this.customers.updateAddress(user.customerId, addressId, dto);
    }
    deleteAddress(user, addressId) {
        this.assertCustomer(user);
        return this.customers.deleteAddress(user.customerId, addressId);
    }
    settings(user) {
        this.assertCustomer(user);
        return this.customers.settings(user.customerId);
    }
    updateSettings(user, dto) {
        this.assertCustomer(user);
        return this.customers.updateSettings(user.customerId, dto);
    }
    exportData(user) {
        this.assertCustomer(user);
        return this.customers.exportData(user.customerId);
    }
    deleteAccount(user) {
        this.assertCustomer(user);
        return this.customers.deleteAccount(user.customerId);
    }
    myDevices(user) {
        this.assertCustomer(user);
        return this.customers.devices(user.customerId);
    }
    async lookup(phone, user) {
        if (user.typ !== 'staff') {
            throw new common_1.ForbiddenException('Поиск по телефону доступен только сотруднику');
        }
        await this.assertCanReadCustomer(user, '');
        const normalized = normalizeLookupPhone(phone ?? '');
        const customer = await this.customers.findByPhone(normalized);
        if (!customer)
            throw new common_1.NotFoundException(`Клиент с номером ${normalized} не найден`);
        return { id: customer.id, name: customer.name, phone: customer.phone };
    }
    async overview(id, user) {
        await this.assertCanReadCustomer(user, id);
        return this.maskOverview(await this.customers.overview(id), user);
    }
    async get(id, user) {
        await this.assertCanReadCustomer(user, id);
        const customer = await this.customers.get(id);
        if (!customer)
            throw new common_1.NotFoundException(`Клиент ${id} не найден`);
        return this.maskCustomer(customer, user);
    }
    async upsert(dto) {
        const customer = await this.customers.createGuest(dto);
        return {
            id: customer.id,
            guestCapability: (0, guest_capability_1.issueGuestCheckoutCapability)(customer.id),
            capabilityExpiresIn: 1800,
        };
    }
    setConsent(id, dto, user) {
        if (user.typ === 'customer' && user.customerId !== id) {
            throw new common_1.ForbiddenException('Нельзя менять согласие другого клиента');
        }
        if (user.typ === 'staff' && user.role !== 'admin' && user.role !== 'owner') {
            throw new common_1.ForbiddenException('Недостаточно прав для изменения согласия');
        }
        return this.customers.setConsent(id, dto.consent, user.customerId);
    }
    async assertCanReadCustomer(user, id) {
        if (user.typ === 'customer' && user.customerId !== id) {
            throw new common_1.ForbiddenException('Нельзя смотреть профиль другого клиента');
        }
        if (user.typ === 'staff') {
            const staff = await this.staffAuth.me(user.customerId);
            if (staff.role !== user.role) {
                throw new common_1.ForbiddenException('Роль сотрудника изменена. Войдите снова');
            }
            if (!(await this.authz.can(staff.role, 'customers', 'read'))) {
                throw new common_1.ForbiddenException('Недостаточно прав для просмотра клиента');
            }
        }
    }
    assertCustomer(user) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
    }
    maskOverview(overview, user) {
        if (this.canReadPii(user, overview.customer.id))
            return overview;
        return {
            ...overview,
            customer: {
                ...overview.customer,
                phone: this.maskPhone(overview.customer.phone),
            },
        };
    }
    maskCustomer(customer, user) {
        if (this.canReadPii(user, customer.id))
            return customer;
        return { ...customer, phone: this.maskPhone(customer.phone) };
    }
    canReadPii(user, customerId) {
        if (user?.typ === 'customer')
            return user.customerId === customerId;
        if (user?.typ === 'staff')
            return user.role === 'admin' || user.role === 'owner';
        return false;
    }
    maskPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length <= 4)
            return '***';
        const prefix = phone.startsWith('+') ? `+${digits.slice(0, 3)}` : digits.slice(0, 3);
        return `${prefix}******${digits.slice(-2)}`;
    }
};
exports.CustomersController = CustomersController;
__decorate([
    (0, common_1.Get)('me/loyalty'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "loyalty", null);
__decorate([
    (0, common_1.Get)('me/addresses'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "addresses", null);
__decorate([
    (0, common_1.Post)('me/addresses'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, customers_dto_1.CreateCustomerAddressDto]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "createAddress", null);
__decorate([
    (0, common_1.Patch)('me/addresses/:addressId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('addressId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, customers_dto_1.UpdateCustomerAddressDto]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "updateAddress", null);
__decorate([
    (0, common_1.Delete)('me/addresses/:addressId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('addressId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "deleteAddress", null);
__decorate([
    (0, common_1.Get)('me/settings'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "settings", null);
__decorate([
    (0, common_1.Patch)('me/settings'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, customers_dto_1.UpdateCustomerSettingsDto]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "updateSettings", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Export all personal data as one JSON document (self-service)' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Profile, addresses, orders, loyalty, coupons and notification preferences.' }),
    (0, common_1.Get)('me/export'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60_000 } }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "exportData", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Delete the account: anonymize PII and revoke sessions; orders stay for accounting' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: 'Account anonymized; all sessions revoked.' }),
    (0, common_1.Delete)('me'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "deleteAccount", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Devices the authenticated customer bought (IMEI + warranty)' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: "The current customer's devices." }),
    (0, common_1.Get)('me/devices'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "myDevices", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Найти клиента по телефону (приёмка у прилавка)',
        description: 'Скупка Б/У требует customerId, а у оператора на руках только телефон продавца. '
            + 'POST /customers для этого не годится — он отказывает на существующем номере.',
    }),
    (0, swagger_1.ApiOkResponse)({ description: '{ id, name, phone }' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Клиента с таким номером нет.' }),
    (0, common_1.Get)('lookup'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Query)('phone')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "lookup", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Customer 360 — orders, spend, debts, warranties, tickets (CRM read)' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Customer id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Aggregated customer overview.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Customer does not exist.' }),
    (0, common_1.Get)(':id/overview'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "overview", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get a customer' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Customer id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Customer found.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Customer does not exist.' }),
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "get", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create a new customer for guest checkout' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Customer created for this guest checkout.' }),
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [customers_dto_1.UpsertCustomerDto]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "upsert", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Set marketing consent (Notification Preferences, customer.consent_changed)' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Customer id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Consent updated.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Customer does not exist.' }),
    (0, common_1.Patch)(':id/consent'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, customers_dto_1.SetConsentDto, Object]),
    __metadata("design:returntype", void 0)
], CustomersController.prototype, "setConsent", null);
exports.CustomersController = CustomersController = __decorate([
    (0, swagger_1.ApiTags)('customers'),
    (0, common_1.Controller)('customers'),
    __metadata("design:paramtypes", [customers_service_1.CustomersService,
        staff_auth_service_1.StaffAuthService,
        authz_service_1.AuthzService])
], CustomersController);
function requireIdempotencyKey(value) {
    const key = value?.trim();
    if (!key)
        throw new common_1.BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128)
        throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
    return key;
}
function normalizeLookupPhone(raw) {
    const stripped = raw.replace(/[\s()-]/g, '').trim();
    if (!/^\+?[1-9]\d{8,14}$/.test(stripped)) {
        throw new errors_1.ValidationError('phone_invalid', 'Некорректный номер телефона');
    }
    return stripped.startsWith('+') ? stripped : `+${stripped}`;
}
//# sourceMappingURL=customers.controller.js.map