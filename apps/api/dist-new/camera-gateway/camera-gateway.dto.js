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
exports.IngestCameraEventDto = exports.RegisterEdgeDeviceDto = exports.CAMERA_EVENT_TYPES = void 0;
const class_validator_1 = require("class-validator");
exports.CAMERA_EVENT_TYPES = [
    'queue_length_estimated', 'shelf_empty_detected', 'camera_offline',
    'camera_tamper_detected', 'restricted_area_motion', 'fall_or_safety_incident',
];
class RegisterEdgeDeviceDto {
}
exports.RegisterEdgeDeviceDto = RegisterEdgeDeviceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], RegisterEdgeDeviceDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], RegisterEdgeDeviceDto.prototype, "storePointId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['camera', 'scanner', 'scale', 'kiosk']),
    __metadata("design:type", String)
], RegisterEdgeDeviceDto.prototype, "kind", void 0);
class IngestCameraEventDto {
}
exports.IngestCameraEventDto = IngestCameraEventDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], IngestCameraEventDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], IngestCameraEventDto.prototype, "deviceId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], IngestCameraEventDto.prototype, "storePointId", void 0);
__decorate([
    (0, class_validator_1.IsIn)(exports.CAMERA_EVENT_TYPES),
    __metadata("design:type", Object)
], IngestCameraEventDto.prototype, "eventType", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    __metadata("design:type", Number)
], IngestCameraEventDto.prototype, "confidence", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], IngestCameraEventDto.prototype, "value", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['non_identifying', 'redacted']),
    __metadata("design:type", String)
], IngestCameraEventDto.prototype, "privacyLevel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], IngestCameraEventDto.prototype, "evidenceRef", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], IngestCameraEventDto.prototype, "occurredAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(720),
    __metadata("design:type", Number)
], IngestCameraEventDto.prototype, "retentionHours", void 0);
//# sourceMappingURL=camera-gateway.dto.js.map