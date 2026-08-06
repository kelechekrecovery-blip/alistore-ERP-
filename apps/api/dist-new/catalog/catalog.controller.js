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
exports.CatalogController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const catalog_dto_1 = require("./catalog.dto");
const catalog_service_1 = require("./catalog.service");
let CatalogController = class CatalogController {
    constructor(catalog) {
        this.catalog = catalog;
    }
    search(query) {
        return this.catalog.search(query);
    }
    delta(query) {
        return this.catalog.delta(query);
    }
    categories() { return this.catalog.categories(); }
    product(id) { return this.catalog.product(id); }
    reindex(maintenanceToken) {
        return this.catalog.reindex(maintenanceToken);
    }
};
exports.CatalogController = CatalogController;
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Search storefront catalog with optional Meilisearch acceleration',
        description: 'Postgres remains source of truth. If Meilisearch is configured but unavailable, this endpoint falls back to Postgres.',
    }),
    (0, swagger_1.ApiOkResponse)({ type: catalog_dto_1.CatalogSearchResponseDto }),
    (0, common_1.Get)('products'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [catalog_dto_1.CatalogSearchQueryDto]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "search", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Delta-sync storefront/POS catalog changes since a previous cursor',
        description: 'Returns changed active products and removed archived products. Stock-count changes are included via DeviceUnit.updatedAt.',
    }),
    (0, swagger_1.ApiOkResponse)({ type: catalog_dto_1.CatalogDeltaResponseDto }),
    (0, common_1.Get)('products/delta'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [catalog_dto_1.CatalogDeltaQueryDto]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "delta", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List active storefront categories without a page-size ceiling' }),
    (0, common_1.Get)('categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "categories", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Read one product with variants and related products' }),
    (0, swagger_1.ApiOkResponse)({ type: catalog_dto_1.CatalogProductDetailDto }),
    (0, common_1.Get)('products/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "product", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Rebuild the Meilisearch products index',
        description: 'Disabled until SEARCH_ADMIN_TOKEN is configured; pass it as x-maintenance-token.',
    }),
    (0, swagger_1.ApiOkResponse)({ type: catalog_dto_1.CatalogReindexResponseDto }),
    (0, swagger_1.ApiForbiddenResponse)({ description: 'Missing or invalid maintenance token.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Meilisearch is not configured.' }),
    (0, common_1.Post)('search/reindex'),
    __param(0, (0, common_1.Headers)('x-maintenance-token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "reindex", null);
exports.CatalogController = CatalogController = __decorate([
    (0, swagger_1.ApiTags)('catalog'),
    (0, common_1.Controller)('catalog'),
    __metadata("design:paramtypes", [catalog_service_1.CatalogService])
], CatalogController);
//# sourceMappingURL=catalog.controller.js.map