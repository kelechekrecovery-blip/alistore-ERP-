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
exports.ModerateProductReviewDto = exports.ProductReviewModerationQueryDto = exports.PRODUCT_REVIEW_STATUSES = exports.CreateProductReviewDto = exports.DeleteProductDto = exports.ChangePriceDto = exports.UpdateProductDto = exports.CreateProductDto = exports.CreateProductSupplierOfferDto = exports.ProductBundleComponentDto = exports.ProductListQueryDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
function parseBoolean(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value === 'boolean')
        return value;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}
class ProductListQueryDto {
    constructor() {
        this.limit = 50;
        this.offset = 0;
    }
}
exports.ProductListQueryDto = ProductListQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Search by SKU, name, or category.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ProductListQueryDto.prototype, "q", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: false, description: 'Include archived products.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => parseBoolean(value)),
    __metadata("design:type", Boolean)
], ProductListQueryDto.prototype, "includeArchived", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 100, default: 50 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Object)
], ProductListQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, default: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Object)
], ProductListQueryDto.prototype, "offset", void 0);
class ProductBundleComponentDto {
}
exports.ProductBundleComponentDto = ProductBundleComponentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'IPHONE-15-128-BLK' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], ProductBundleComponentDto.prototype, "sku", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, maximum: 100, example: 1 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], ProductBundleComponentDto.prototype, "qty", void 0);
class CreateProductSupplierOfferDto {
}
exports.CreateProductSupplierOfferDto = CreateProductSupplierOfferDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateProductSupplierOfferDto.prototype, "supplierId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateProductSupplierOfferDto.prototype, "supplierSku", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateProductSupplierOfferDto.prototype, "unitCost", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateProductSupplierOfferDto.prototype, "availableQty", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, maximum: 180 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], CreateProductSupplierOfferDto.prototype, "leadDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 168, default: 24 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(168),
    __metadata("design:type", Number)
], CreateProductSupplierOfferDto.prototype, "validForHours", void 0);
class CreateProductDto {
}
exports.CreateProductDto = CreateProductDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'IPHONE-15-128-BLK' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateProductDto.prototype, "sku", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '194253404842' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateProductDto.prototype, "barcode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'iphone-15' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateProductDto.prototype, "variantGroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'iPhone 15 128GB Black' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], CreateProductDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 109900, description: 'Initial price (сом)' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateProductDto.prototype, "price", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 92000, description: 'Cost (сом)' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateProductDto.prototype, "cost", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'phones' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateProductDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'vat_standard', default: 'vat_standard' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateProductDto.prototype, "taxCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 10000, example: 1200, default: 1200 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10000),
    __metadata("design:type", Number)
], CreateProductDto.prototype, "taxRateBps", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['serialized', 'quantity'], default: 'serialized' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['serialized', 'quantity']),
    __metadata("design:type", String)
], CreateProductDto.prototype, "trackingMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['own_stock', 'to_order'], default: 'own_stock' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['own_stock', 'to_order']),
    __metadata("design:type", String)
], CreateProductDto.prototype, "supplyMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 180 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], CreateProductDto.prototype, "supplyLeadDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => CreateProductSupplierOfferDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => CreateProductSupplierOfferDto),
    __metadata("design:type", CreateProductSupplierOfferDto)
], CreateProductDto.prototype, "supplierOffer", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: 'object',
        additionalProperties: true,
        example: { storage: '128GB', color: 'black' },
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateProductDto.prototype, "attrs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => [ProductBundleComponentDto] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ProductBundleComponentDto),
    __metadata("design:type", Array)
], CreateProductDto.prototype, "bundleComponents", void 0);
class UpdateProductDto {
}
exports.UpdateProductDto = UpdateProductDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '194253404842', nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "barcode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'iphone-15', nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "variantGroup", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'iPhone 15 128GB Black' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, example: 92000, description: 'Cost (сом)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateProductDto.prototype, "cost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'phones' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'vat_standard' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "taxCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 10000, example: 1200 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10000),
    __metadata("design:type", Number)
], UpdateProductDto.prototype, "taxRateBps", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['serialized', 'quantity'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['serialized', 'quantity']),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "trackingMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['own_stock', 'to_order'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['own_stock', 'to_order']),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "supplyMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 180, example: 7, description: 'Срок поставки под заказ, дней' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], UpdateProductDto.prototype, "supplyLeadDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Поставщик. Внутреннее поле, в публичный каталог не попадает.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "supplierId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: 'object',
        additionalProperties: true,
        example: { storage: '128GB', color: 'black' },
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateProductDto.prototype, "attrs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => [ProductBundleComponentDto], description: 'Send [] to turn a bundle back into a regular product.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ProductBundleComponentDto),
    __metadata("design:type", Array)
], UpdateProductDto.prototype, "bundleComponents", void 0);
class ChangePriceDto {
}
exports.ChangePriceDto = ChangePriceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 0, example: 119900, description: 'New price (сом)' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ChangePriceDto.prototype, "price", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'подорожание у поставщика' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ChangePriceDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'senior_seller_azamat' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ChangePriceDto.prototype, "requester", void 0);
class DeleteProductDto {
}
exports.DeleteProductDto = DeleteProductDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'снят с продажи' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeleteProductDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'owner' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeleteProductDto.prototype, "requester", void 0);
class CreateProductReviewDto {
}
exports.CreateProductReviewDto = CreateProductReviewDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, maximum: 5, example: 5 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], CreateProductReviewDto.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Быстро доставили, устройство как новое.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateProductReviewDto.prototype, "text", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Specific paid/completed order to attach the review to.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProductReviewDto.prototype, "orderId", void 0);
exports.PRODUCT_REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
class ProductReviewModerationQueryDto {
}
exports.ProductReviewModerationQueryDto = ProductReviewModerationQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.PRODUCT_REVIEW_STATUSES, default: 'pending' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.PRODUCT_REVIEW_STATUSES),
    __metadata("design:type", Object)
], ProductReviewModerationQueryDto.prototype, "status", void 0);
class ModerateProductReviewDto {
}
exports.ModerateProductReviewDto = ModerateProductReviewDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['approve', 'reject'] }),
    (0, class_validator_1.IsIn)(['approve', 'reject']),
    __metadata("design:type", String)
], ModerateProductReviewDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 300, example: 'Спам или внешняя ссылка' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], ModerateProductReviewDto.prototype, "reason", void 0);
//# sourceMappingURL=products.dto.js.map