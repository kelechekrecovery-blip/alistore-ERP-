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
exports.ResolveStoreIncidentDto = exports.CreateStoreIncidentDto = exports.UpdateChecklistItemDto = exports.CreateStoreChecklistDto = exports.StoreOperationsQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const CHECKLIST_TYPES = ['opening', 'closing'];
const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'];
class StoreOperationsQueryDto {
}
exports.StoreOperationsQueryDto = StoreOperationsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], StoreOperationsQueryDto.prototype, "point", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-17' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], StoreOperationsQueryDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['open', 'investigating', 'resolved'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['open', 'investigating', 'resolved']),
    __metadata("design:type", String)
], StoreOperationsQueryDto.prototype, "status", void 0);
class CreateStoreChecklistDto {
}
exports.CreateStoreChecklistDto = CreateStoreChecklistDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateStoreChecklistDto.prototype, "point", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: CHECKLIST_TYPES }),
    (0, class_validator_1.IsIn)(CHECKLIST_TYPES),
    __metadata("design:type", Object)
], CreateStoreChecklistDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-17' }),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CreateStoreChecklistDto.prototype, "businessDate", void 0);
class UpdateChecklistItemDto {
}
exports.UpdateChecklistItemDto = UpdateChecklistItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateChecklistItemDto.prototype, "checked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Терминал прошёл утренний тест' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UpdateChecklistItemDto.prototype, "note", void 0);
class CreateStoreIncidentDto {
}
exports.CreateStoreIncidentDto = CreateStoreIncidentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'BISHKEK-1' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateStoreIncidentDto.prototype, "point", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-07-17' }),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CreateStoreIncidentDto.prototype, "businessDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'cash' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateStoreIncidentDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: INCIDENT_SEVERITIES }),
    (0, class_validator_1.IsIn)(INCIDENT_SEVERITIES),
    __metadata("design:type", Object)
], CreateStoreIncidentDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Не работает терминал на кассе 2' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], CreateStoreIncidentDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Платёжный терминал не выходит в сеть после перезапуска.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateStoreIncidentDto.prototype, "description", void 0);
class ResolveStoreIncidentDto {
}
exports.ResolveStoreIncidentDto = ResolveStoreIncidentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Терминал заменён, повторный тест успешен.' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], ResolveStoreIncidentDto.prototype, "resolution", void 0);
//# sourceMappingURL=store-operations.dto.js.map