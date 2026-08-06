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
exports.CampaignConversionDto = exports.RecordCampaignSpendDto = exports.UpdateCampaignDto = exports.CreateCampaignDto = exports.SegmentRulesDto = exports.CAMPAIGN_CREATIVE_TYPES = exports.CAMPAIGN_CHANNELS = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
exports.CAMPAIGN_CHANNELS = ['sms', 'push', 'telegram', 'whatsapp'];
exports.CAMPAIGN_CREATIVE_TYPES = ['text', 'image', 'video'];
class SegmentRulesDto {
}
exports.SegmentRulesDto = SegmentRulesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'gold', description: 'Customer.segments tag for loyalty level' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SegmentRulesDto.prototype, "level", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Бишкек', description: 'Matches Customer.segments city:<value> or raw value' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SegmentRulesDto.prototype, "city", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: ['iphone'], type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], SegmentRulesDto.prototype, "tags", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 50000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SegmentRulesDto.prototype, "minSpent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 200000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SegmentRulesDto.prototype, "maxSpent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 50000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SegmentRulesDto.prototype, "minLtv", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 200000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SegmentRulesDto.prototype, "maxLtv", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(500),
    __metadata("design:type", Number)
], SegmentRulesDto.prototype, "limit", void 0);
class CreateCampaignDto extends SegmentRulesDto {
}
exports.CreateCampaignDto = CreateCampaignDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'VIP аксессуары · июль' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.CAMPAIGN_CHANNELS, example: 'sms' }),
    (0, class_validator_1.IsIn)(exports.CAMPAIGN_CHANNELS),
    __metadata("design:type", Object)
], CreateCampaignDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10000 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateCampaignDto.prototype, "budget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'VIP-предложение AliStore' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "creativeHeadline", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.CAMPAIGN_CREATIVE_TYPES, example: 'image' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.CAMPAIGN_CREATIVE_TYPES),
    __metadata("design:type", Object)
], CreateCampaignDto.prototype, "creativeType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Скидка 10% на аксессуары до воскресенья' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "creativeBody", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://media.ali.kg/campaigns/vip.jpg' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "creativeAssetUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Смотреть предложение' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "creativeCtaLabel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '/catalog?category=accessories' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "destinationUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'alistore_crm' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'whatsapp' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "medium", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'VIP10' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "promotionCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'campaign_offer' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateCampaignDto.prototype, "template", void 0);
class UpdateCampaignDto extends SegmentRulesDto {
}
exports.UpdateCampaignDto = UpdateCampaignDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.CAMPAIGN_CHANNELS }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.CAMPAIGN_CHANNELS),
    __metadata("design:type", Object)
], UpdateCampaignDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateCampaignDto.prototype, "budget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "creativeHeadline", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.CAMPAIGN_CREATIVE_TYPES }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.CAMPAIGN_CREATIVE_TYPES),
    __metadata("design:type", Object)
], UpdateCampaignDto.prototype, "creativeType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "creativeBody", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "creativeAssetUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "creativeCtaLabel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "destinationUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "medium", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "promotionCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateCampaignDto.prototype, "template", void 0);
class RecordCampaignSpendDto {
}
exports.RecordCampaignSpendDto = RecordCampaignSpendDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '145f3322-377e-4ec2-b3fb-bc4db254735d' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], RecordCampaignSpendDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'meta_ads' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], RecordCampaignSpendDto.prototype, "provider", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'invoice-2026-07-15-001' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], RecordCampaignSpendDto.prototype, "externalRef", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2500 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], RecordCampaignSpendDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-15T08:00:00.000Z' }),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], RecordCampaignSpendDto.prototype, "occurredAt", void 0);
class CampaignConversionDto {
}
exports.CampaignConversionDto = CampaignConversionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_order_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CampaignConversionDto.prototype, "orderId", void 0);
//# sourceMappingURL=campaigns.dto.js.map