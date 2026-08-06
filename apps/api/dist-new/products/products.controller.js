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
exports.ProductsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const products_service_1 = require("./products.service");
const products_dto_1 = require("./products.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let ProductsController = class ProductsController {
    constructor(products) {
        this.products = products;
    }
    moderationQueue(query) {
        return this.products.reviewModerationQueue(query.status ?? 'pending');
    }
    moderateReview(user, reviewId, dto) {
        return this.products.moderateReview(reviewId, dto, user.customerId);
    }
    list(query) {
        return this.products.list(query);
    }
    create(user, dto) {
        return this.products.create(dto, user.customerId);
    }
    async get(id) {
        const product = await this.products.get(id);
        if (!product)
            throw new common_1.NotFoundException(`Товар ${id} не найден`);
        return product;
    }
    reviews(id) {
        return this.products.reviews(id);
    }
    createReview(user, id, dto) {
        return this.products.createReview(id, user, dto);
    }
    update(user, id, dto) {
        return this.products.update(id, dto, user.customerId);
    }
    changePrice(user, id, dto) {
        return this.products.changePrice(id, dto.price, dto.reason, user.customerId);
    }
    remove(user, id, dto) {
        return this.products.archive(id, dto.reason, user.customerId);
    }
};
exports.ProductsController = ProductsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List reviews awaiting or completed marketing moderation' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'read'),
    (0, common_1.Get)('reviews/moderation'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [products_dto_1.ProductReviewModerationQueryDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "moderationQueue", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Approve or reject a customer review before storefront publication' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('storefront', 'update'),
    (0, common_1.Post)('reviews/:reviewId/moderate'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('reviewId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, products_dto_1.ModerateProductReviewDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "moderateReview", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List products for staff management' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('products', 'read'),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [products_dto_1.ProductListQueryDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "list", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create a product for the catalog' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('products', 'create'),
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, products_dto_1.CreateProductDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get a product for staff management' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Product does not exist.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('products', 'read'),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "get", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List product reviews and summary rating' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Product id' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ productId, sku, count, avgRating, items[] }.' }),
    (0, common_1.Get)(':id/reviews'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "reviews", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create a customer review for a purchased product' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Product id' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)(':id/reviews'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, products_dto_1.CreateProductReviewDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "createReview", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Update non-dangerous product fields (price uses /price)' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Product id' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('products', 'update'),
    (0, common_1.Patch)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, products_dto_1.UpdateProductDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "update", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Change price — applies within ±15%, else parks approval ({ approvalId })',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Product id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Applied, or parked for approval (see body).' }),
    (0, common_1.Patch)(':id/price'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('products', 'price'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, products_dto_1.ChangePriceDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "changePrice", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Delete a product — always approval-gated → soft-delete (202)' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Product id' }),
    (0, swagger_1.ApiAcceptedResponse)({ description: 'Delete parked for approval; not yet archived.' }),
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(202),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('products', 'archive'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, products_dto_1.DeleteProductDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "remove", null);
exports.ProductsController = ProductsController = __decorate([
    (0, swagger_1.ApiTags)('products'),
    (0, common_1.Controller)('products'),
    __metadata("design:paramtypes", [products_service_1.ProductsService])
], ProductsController);
//# sourceMappingURL=products.controller.js.map