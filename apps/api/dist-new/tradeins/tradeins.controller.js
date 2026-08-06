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
exports.TradeInsController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const tradeins_dto_1 = require("./tradeins.dto");
const tradeins_service_1 = require("./tradeins.service");
const valuation_1 = require("./valuation");
const errors_1 = require("../common/errors");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const guest_capability_1 = require("../auth/guest-capability");
const optional_jwt_auth_guard_1 = require("../auth/optional-jwt-auth.guard");
let TradeInsController = class TradeInsController {
    constructor(tradeIns) {
        this.tradeIns = tradeIns;
    }
    async estimate(model, grade) {
        const cleanModel = (model ?? '').trim();
        const cleanGrade = (grade ?? 'A').trim().toUpperCase();
        if (!valuation_1.TRADE_IN_GRADES.includes(cleanGrade)) {
            throw new errors_1.ValidationError('invalid_grade', 'Состояние должно быть A, B или C');
        }
        return {
            model: cleanModel,
            grade: cleanGrade,
            priceSom: cleanModel ? await this.tradeIns.estimate(cleanModel, cleanGrade) : 0,
        };
    }
    create(dto, user, capability, idempotencyKey) {
        if (user?.typ === 'staff')
            throw new common_1.ForbiddenException('Используйте /tradeins/intake');
        const key = requireIdempotencyKey(idempotencyKey);
        if (user?.typ === 'customer') {
            return this.tradeIns.create({ ...dto, customerId: user.customerId }, user.customerId, key);
        }
        const customerId = requiredCustomerId(dto.customerId);
        if (!user)
            (0, guest_capability_1.requireGuestCapability)(capability, 'tradeins:create', customerId);
        return this.tradeIns.create({ ...dto, customerId }, customerId, key);
    }
    mine(user) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        return this.tradeIns.listByCustomer(user.customerId);
    }
    async mineOne(user, id) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        const tradeIn = await this.tradeIns.getOwned(id, user.customerId);
        if (!tradeIn)
            throw new common_1.NotFoundException(`Скупка ${id} не найдена`);
        return tradeIn;
    }
    intake(user, dto, idempotencyKey) {
        const key = requireIdempotencyKey(idempotencyKey);
        const customerId = requiredCustomerId(dto.customerId);
        return this.tradeIns.create({ ...dto, customerId }, user.customerId, key, true);
    }
    async get(id) {
        const tradeIn = await this.tradeIns.get(id);
        if (!tradeIn)
            throw new common_1.NotFoundException(`Скупка ${id} не найдена`);
        return tradeIn;
    }
};
exports.TradeInsController = TradeInsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Предварительная оценка выкупа Б/У — считает сервер' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ model, grade, priceSom } — 0, если модель онлайн не оцениваем.' }),
    (0, common_1.Get)('estimate'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    __param(0, (0, common_1.Query)('model')),
    __param(1, (0, common_1.Query)('grade')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TradeInsController.prototype, "estimate", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Assess and contract a used-device buyback (trade-in)',
        description: 'Creates TradeInDevice, assigns contractId, masks seller passport in the response, and writes tradein.assessed/tradein.contracted events.',
    }),
    (0, swagger_1.ApiCreatedResponse)({ type: tradeins_dto_1.TradeInViewDto }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Customer does not exist or payload is invalid.' }),
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('x-guest-capability')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tradeins_dto_1.CreateTradeInDto, Object, String, String]),
    __metadata("design:returntype", void 0)
], TradeInsController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List trade-ins of the authenticated customer' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ type: tradeins_dto_1.TradeInViewDto, isArray: true }),
    (0, common_1.Get)('mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TradeInsController.prototype, "mine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get one trade-in of the authenticated customer' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ type: tradeins_dto_1.TradeInViewDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Trade-in does not exist or is not owned by the customer.' }),
    (0, common_1.Get)('mine/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TradeInsController.prototype, "mineOne", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Staff intake for an in-store used-device buyback',
        description: 'Same contract creation as customer self-service, but actor comes from the active staff JWT.',
    }),
    (0, swagger_1.ApiCreatedResponse)({ type: tradeins_dto_1.TradeInViewDto }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Customer does not exist or payload is invalid.' }),
    (0, common_1.Post)('intake'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('tradeins', 'intake'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, tradeins_dto_1.CreateTradeInDto, String]),
    __metadata("design:returntype", void 0)
], TradeInsController.prototype, "intake", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get a trade-in by id with protected fields masked' }),
    (0, swagger_1.ApiParam)({ name: 'id' }),
    (0, swagger_1.ApiOkResponse)({ type: tradeins_dto_1.TradeInViewDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Trade-in does not exist.' }),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('tradeins', 'read'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TradeInsController.prototype, "get", null);
exports.TradeInsController = TradeInsController = __decorate([
    (0, swagger_1.ApiTags)('tradeins'),
    (0, common_1.Controller)('tradeins'),
    __metadata("design:paramtypes", [tradeins_service_1.TradeInsService])
], TradeInsController);
function requireIdempotencyKey(value) {
    const key = value?.trim();
    if (!key)
        throw new common_1.BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128)
        throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
    return key;
}
function requiredCustomerId(value) {
    const customerId = value?.trim();
    if (!customerId)
        throw new common_1.BadRequestException('customerId обязателен для guest или staff intake');
    return customerId;
}
//# sourceMappingURL=tradeins.controller.js.map