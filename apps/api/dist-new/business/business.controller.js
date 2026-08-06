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
exports.BusinessController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const jwt_1 = require("@nestjs/jwt");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const business_auth_service_1 = require("./business-auth.service");
const business_products_service_1 = require("./business-products.service");
const business_auth_guard_1 = require("./business-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
class BusinessLoginDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    __metadata("design:type", String)
], BusinessLoginDto.prototype, "username", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    __metadata("design:type", String)
], BusinessLoginDto.prototype, "password", void 0);
class UpdatePriceDto {
}
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], UpdatePriceDto.prototype, "price", void 0);
let BusinessController = class BusinessController {
    constructor(auth, products, jwt) {
        this.auth = auth;
        this.products = products;
        this.jwt = jwt;
    }
    async login(dto) {
        const session = await this.auth.login(dto.username, dto.password);
        const accessToken = await this.jwt.signAsync({ sub: session.userId, typ: 'seller', sellerId: session.sellerId }, { expiresIn: '8h' });
        return { accessToken, seller: { id: session.sellerId, name: session.sellerName }, username: session.username };
    }
    list(user) {
        return this.products.list(user);
    }
    updatePrice(user, id, dto) {
        return this.products.updatePrice(user, id, dto.price);
    }
};
exports.BusinessController = BusinessController;
__decorate([
    (0, common_1.Post)('auth/login'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    (0, swagger_1.ApiOperation)({ summary: 'Вход магазина-партнёра' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [BusinessLoginDto]),
    __metadata("design:returntype", Promise)
], BusinessController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('products'),
    (0, common_1.UseGuards)(business_auth_guard_1.BusinessAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Свой ассортимент' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Позиции этого магазина и только они.' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BusinessController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)('products/:id/price'),
    (0, common_1.UseGuards)(business_auth_guard_1.BusinessAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Сменить цену своей позиции' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, UpdatePriceDto]),
    __metadata("design:returntype", void 0)
], BusinessController.prototype, "updatePrice", null);
exports.BusinessController = BusinessController = __decorate([
    (0, swagger_1.ApiTags)('AliStore Business'),
    (0, common_1.Controller)('business'),
    __metadata("design:paramtypes", [business_auth_service_1.BusinessAuthService,
        business_products_service_1.BusinessProductsService,
        jwt_1.JwtService])
], BusinessController);
//# sourceMappingURL=business.controller.js.map