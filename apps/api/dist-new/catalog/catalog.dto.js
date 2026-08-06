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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogDeltaResponseDto = exports.CatalogDeltaQueryDto = exports.CatalogReindexResponseDto = exports.CatalogSearchResponseDto = exports.CatalogProductDetailDto = exports.CatalogProductDto = exports.SellerRefDto = exports.InstallmentProviderDto = exports.InstallmentOfferDto = exports.InstallmentStepDto = exports.CatalogSearchQueryDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
function parseBoolean(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value === 'boolean')
        return value;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}
class CatalogSearchQueryDto {
    constructor() {
        this.limit = 24;
        this.offset = 0;
    }
}
exports.CatalogSearchQueryDto = CatalogSearchQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Search text matched against product name, SKU, and category.',
        example: 'iphone 15',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CatalogSearchQueryDto.prototype, "q", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'phones' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CatalogSearchQueryDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'When true, returns only products with at least one in-stock unit.',
        example: true,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => parseBoolean(value)),
    __metadata("design:type", Boolean)
], CatalogSearchQueryDto.prototype, "stockOnly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['name', 'price_asc', 'price_desc', 'stock_desc'], default: 'name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['name', 'price_asc', 'price_desc', 'stock_desc']),
    __metadata("design:type", String)
], CatalogSearchQueryDto.prototype, "sort", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 100, default: 24 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Object)
], CatalogSearchQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, default: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Object)
], CatalogSearchQueryDto.prototype, "offset", void 0);
class InstallmentStepDto {
}
exports.InstallmentStepDto = InstallmentStepDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12 }),
    __metadata("design:type", Number)
], InstallmentStepDto.prototype, "months", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2075, description: 'Наименьший платёж на этой ступени, сом.' }),
    __metadata("design:type", Number)
], InstallmentStepDto.prototype, "monthlySom", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ['O!Market', 'ZERO'], description: 'Где эту ступень оформить.' }),
    __metadata("design:type", Array)
], InstallmentStepDto.prototype, "providers", void 0);
class InstallmentOfferDto {
}
exports.InstallmentOfferDto = InstallmentOfferDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'omarket' }),
    __metadata("design:type", String)
], InstallmentOfferDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'O!Market' }),
    __metadata("design:type", String)
], InstallmentOfferDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12 }),
    __metadata("design:type", Number)
], InstallmentOfferDto.prototype, "months", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2075, description: 'Ежемесячный платёж, сом.' }),
    __metadata("design:type", Number)
], InstallmentOfferDto.prototype, "monthlySom", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 24900, description: 'Итого к выплате: цена плюс наценка магазина.' }),
    __metadata("design:type", Number)
], InstallmentOfferDto.prototype, "totalSom", void 0);
class InstallmentProviderDto {
}
exports.InstallmentProviderDto = InstallmentProviderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'omarket' }),
    __metadata("design:type", String)
], InstallmentProviderDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'O!Market' }),
    __metadata("design:type", String)
], InstallmentProviderDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '/media/qr-omarket.png', description: 'QR магазина, загруженный владельцем в ERP.' }),
    __metadata("design:type", String)
], InstallmentProviderDto.prototype, "qrUrl", void 0);
class SellerRefDto {
}
exports.SellerRefDto = SellerRefDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_seller_001' }),
    __metadata("design:type", String)
], SellerRefDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Мобайл Плюс' }),
    __metadata("design:type", String)
], SellerRefDto.prototype, "name", void 0);
class CatalogProductDto {
}
exports.CatalogProductDto = CatalogProductDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => SellerRefDto }),
    __metadata("design:type", SellerRefDto)
], CatalogProductDto.prototype, "seller", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => InstallmentOfferDto, nullable: true }),
    __metadata("design:type", Object)
], CatalogProductDto.prototype, "installment", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => [InstallmentStepDto] }),
    __metadata("design:type", Array)
], CatalogProductDto.prototype, "installmentSteps", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => [InstallmentProviderDto] }),
    __metadata("design:type", Array)
], CatalogProductDto.prototype, "installmentProviders", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 249 }),
    __metadata("design:type", Number)
], CatalogProductDto.prototype, "bonusPoints", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CatalogProductDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CatalogProductDto.prototype, "sku", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CatalogProductDto.prototype, "barcode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CatalogProductDto.prototype, "variantGroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CatalogProductDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 109900 }),
    __metadata("design:type", Number)
], CatalogProductDto.prototype, "price", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'phones' }),
    __metadata("design:type", String)
], CatalogProductDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['serialized', 'quantity'] }),
    __metadata("design:type", String)
], CatalogProductDto.prototype, "trackingMode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['own_stock', 'to_order'] }),
    __metadata("design:type", String)
], CatalogProductDto.prototype, "supplyMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, example: 7 }),
    __metadata("design:type", Object)
], CatalogProductDto.prototype, "supplyLeadDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CatalogProductDto.prototype, "orderable", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['in_stock', 'to_order', 'unavailable'] }),
    __metadata("design:type", String)
], CatalogProductDto.prototype, "availabilityKind", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, example: 7 }),
    __metadata("design:type", Object)
], CatalogProductDto.prototype, "leadTimeDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, example: '2026-08-05' }),
    __metadata("design:type", Object)
], CatalogProductDto.prototype, "estimatedDeliveryDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: 'object', additionalProperties: true }),
    __metadata("design:type", Object)
], CatalogProductDto.prototype, "attrs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: 'array', items: { type: 'object' } }),
    __metadata("design:type", Array)
], CatalogProductDto.prototype, "bundleComponents", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3 }),
    __metadata("design:type", Number)
], CatalogProductDto.prototype, "availableUnits", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 8 }),
    __metadata("design:type", Number)
], CatalogProductDto.prototype, "reviewCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, example: 4.8 }),
    __metadata("design:type", Object)
], CatalogProductDto.prototype, "avgRating", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-08T09:30:00.000Z' }),
    __metadata("design:type", String)
], CatalogProductDto.prototype, "updatedAt", void 0);
class CatalogProductDetailDto {
}
exports.CatalogProductDetailDto = CatalogProductDetailDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => CatalogProductDto }),
    __metadata("design:type", CatalogProductDto)
], CatalogProductDetailDto.prototype, "product", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [CatalogProductDto] }),
    __metadata("design:type", Array)
], CatalogProductDetailDto.prototype, "variants", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [CatalogProductDto] }),
    __metadata("design:type", Array)
], CatalogProductDetailDto.prototype, "related", void 0);
class CatalogSearchResponseDto {
}
exports.CatalogSearchResponseDto = CatalogSearchResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['postgres', 'meilisearch', 'postgres_fallback'] }),
    __metadata("design:type", String)
], CatalogSearchResponseDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Present when Meilisearch was configured but the API used Postgres fallback.',
    }),
    __metadata("design:type", String)
], CatalogSearchResponseDto.prototype, "warning", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12 }),
    __metadata("design:type", Number)
], CatalogSearchResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 24 }),
    __metadata("design:type", Number)
], CatalogSearchResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0 }),
    __metadata("design:type", Number)
], CatalogSearchResponseDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [CatalogProductDto] }),
    __metadata("design:type", Array)
], CatalogSearchResponseDto.prototype, "items", void 0);
class CatalogReindexResponseDto {
}
exports.CatalogReindexResponseDto = CatalogReindexResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['meilisearch'] }),
    __metadata("design:type", String)
], CatalogReindexResponseDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'products' }),
    __metadata("design:type", String)
], CatalogReindexResponseDto.prototype, "index", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 42 }),
    __metadata("design:type", Number)
], CatalogReindexResponseDto.prototype, "indexed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 123 }),
    __metadata("design:type", Object)
], CatalogReindexResponseDto.prototype, "taskUid", void 0);
class CatalogDeltaQueryDto {
    constructor() {
        this.limit = 500;
    }
}
exports.CatalogDeltaQueryDto = CatalogDeltaQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'ISO cursor returned by a previous delta response.',
        example: '2026-07-08T09:30:00.000Z',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CatalogDeltaQueryDto.prototype, "since", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 500, default: 500 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(500),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Object)
], CatalogDeltaQueryDto.prototype, "limit", void 0);
class CatalogDeltaResponseDto {
}
exports.CatalogDeltaResponseDto = CatalogDeltaResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-08T09:31:00.000Z' }),
    __metadata("design:type", String)
], CatalogDeltaResponseDto.prototype, "cursor", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-08T09:30:00.000Z' }),
    __metadata("design:type", String)
], CatalogDeltaResponseDto.prototype, "since", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [CatalogProductDto] }),
    __metadata("design:type", Array)
], CatalogDeltaResponseDto.prototype, "changed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [String], example: ['clx_archived_product'] }),
    __metadata("design:type", Array)
], CatalogDeltaResponseDto.prototype, "removed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2 }),
    __metadata("design:type", Number)
], CatalogDeltaResponseDto.prototype, "totalChanged", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1 }),
    __metadata("design:type", Number)
], CatalogDeltaResponseDto.prototype, "totalRemoved", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false }),
    __metadata("design:type", Boolean)
], CatalogDeltaResponseDto.prototype, "truncated", void 0);
//# sourceMappingURL=catalog.dto.js.map