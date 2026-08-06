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
exports.EvidenceImageDto = exports.EVIDENCE_ENTITY_TYPES = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
exports.EVIDENCE_ENTITY_TYPES = [
    'tradein',
    'return',
    'warranty',
    'inventory',
    'order',
    'support',
    'shift',
    'loaner',
    'quarantine',
    'exchange',
];
class EvidenceImageDto {
}
exports.EvidenceImageDto = EvidenceImageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.EVIDENCE_ENTITY_TYPES, example: 'tradein' }),
    (0, class_validator_1.IsIn)(exports.EVIDENCE_ENTITY_TYPES),
    __metadata("design:type", String)
], EvidenceImageDto.prototype, "entityType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_entity_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EvidenceImageDto.prototype, "entityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'device_front' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EvidenceImageDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'customer_app' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EvidenceImageDto.prototype, "actor", void 0);
//# sourceMappingURL=evidence.dto.js.map