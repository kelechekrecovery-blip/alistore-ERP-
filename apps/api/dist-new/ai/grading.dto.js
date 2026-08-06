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
exports.GradePhotosDto = exports.PhotoEvidenceDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class PhotoEvidenceDto {
}
exports.PhotoEvidenceDto = PhotoEvidenceDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://cdn.ali.kg/evidence/front.webp' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PhotoEvidenceDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'cmrc_photo_front' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PhotoEvidenceDto.prototype, "evidenceId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'front' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PhotoEvidenceDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'image/webp' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PhotoEvidenceDto.prototype, "mimeType", void 0);
class GradePhotosDto {
}
exports.GradePhotosDto = GradePhotosDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [PhotoEvidenceDto],
        description: 'Evidence Vault ids or photo URLs. At least one image reference is required.',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PhotoEvidenceDto),
    __metadata("design:type", Array)
], GradePhotosDto.prototype, "photos", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'iPhone 15 Pro 256GB' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GradePhotosDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '356789012345678' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GradePhotosDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['A', 'B', 'C'], example: 'B' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['A', 'B', 'C']),
    __metadata("design:type", String)
], GradePhotosDto.prototype, "claimedGrade", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: [String],
        example: ['screen scratch', 'battery wear'],
        description: 'Manual intake findings. The keyless grader uses these deterministically.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], GradePhotosDto.prototype, "observedDefects", void 0);
//# sourceMappingURL=grading.dto.js.map