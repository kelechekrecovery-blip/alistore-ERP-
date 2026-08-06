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
exports.CampaignFunnelDto = exports.OrderAttributionDto = exports.AttributionTouchDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class AttributionTouchDto {
}
exports.AttributionTouchDto = AttributionTouchDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'instagram' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], AttributionTouchDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'paid_social' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], AttributionTouchDto.prototype, "medium", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'cmp_7P4M2K9Q' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], AttributionTouchDto.prototype, "campaign", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'summer-hero-a' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], AttributionTouchDto.prototype, "content", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'iphone bishkek' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], AttributionTouchDto.prototype, "term", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '/catalog?category=phones' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], AttributionTouchDto.prototype, "landing", void 0);
class OrderAttributionDto {
}
exports.OrderAttributionDto = OrderAttributionDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '9a89ddf4-a2a7-4735-a544-8a58d732ad47' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], OrderAttributionDto.prototype, "journeyId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: AttributionTouchDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AttributionTouchDto),
    __metadata("design:type", AttributionTouchDto)
], OrderAttributionDto.prototype, "first", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: AttributionTouchDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AttributionTouchDto),
    __metadata("design:type", AttributionTouchDto)
], OrderAttributionDto.prototype, "last", void 0);
class CampaignFunnelDto {
}
exports.CampaignFunnelDto = CampaignFunnelDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'cmp_7P4M2K9Q' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CampaignFunnelDto.prototype, "trackingCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '9a89ddf4-a2a7-4735-a544-8a58d732ad47' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CampaignFunnelDto.prototype, "journeyId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['click', 'visit'], example: 'visit' }),
    (0, class_validator_1.IsIn)(['click', 'visit']),
    __metadata("design:type", String)
], CampaignFunnelDto.prototype, "stage", void 0);
//# sourceMappingURL=attribution.dto.js.map