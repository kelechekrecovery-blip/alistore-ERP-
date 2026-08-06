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
exports.ListStaffTasksDto = exports.UpdateMyStaffTaskDto = exports.CreateStaffTaskDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CreateStaffTaskDto {
}
exports.CreateStaffTaskDto = CreateStaffTaskDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Обновить ценники на витрине' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateStaffTaskDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateStaffTaskDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateStaffTaskDto.prototype, "assigneeId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.StaffTaskPriority }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.StaffTaskPriority),
    __metadata("design:type", String)
], CreateStaffTaskDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], CreateStaffTaskDto.prototype, "dueAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateStaffTaskDto.prototype, "relatedType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], CreateStaffTaskDto.prototype, "relatedId", void 0);
class UpdateMyStaffTaskDto {
}
exports.UpdateMyStaffTaskDto = UpdateMyStaffTaskDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['in_progress', 'completed'] }),
    (0, class_validator_1.IsEnum)(client_1.StaffTaskStatus),
    __metadata("design:type", String)
], UpdateMyStaffTaskDto.prototype, "status", void 0);
class ListStaffTasksDto {
}
exports.ListStaffTasksDto = ListStaffTasksDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.StaffTaskStatus, isArray: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => (typeof value === 'string' ? value.split(',').map((part) => part.trim()).filter(Boolean) : value)),
    (0, class_validator_1.IsEnum)(client_1.StaffTaskStatus, { each: true }),
    __metadata("design:type", Array)
], ListStaffTasksDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListStaffTasksDto.prototype, "assigneeId", void 0);
//# sourceMappingURL=staff-tasks.dto.js.map