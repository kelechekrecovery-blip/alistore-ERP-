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
exports.EscalateTicketDto = exports.TicketTransitionDto = exports.OpenMineTicketDto = exports.OpenTicketDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const CHANNELS = ['web', 'app', 'whatsapp', 'telegram', 'call', 'store'];
const TRANSITION_TARGETS = ['in_progress', 'waiting', 'resolved', 'closed'];
class OpenTicketDto {
}
exports.OpenTicketDto = OpenTicketDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'clx_customer_001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenTicketDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: CHANNELS, example: 'whatsapp' }),
    (0, class_validator_1.IsIn)(CHANNELS),
    __metadata("design:type", Object)
], OpenTicketDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Не приходит чек на почту' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenTicketDto.prototype, "subject", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Оплатил заказ, чек не пришёл' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenTicketDto.prototype, "body", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['normal', 'high', 'urgent'], example: 'normal' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['normal', 'high', 'urgent']),
    __metadata("design:type", String)
], OpenTicketDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'support_agent_1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenTicketDto.prototype, "actor", void 0);
class OpenMineTicketDto {
}
exports.OpenMineTicketDto = OpenMineTicketDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'app' }),
    (0, class_validator_1.IsIn)(CHANNELS),
    __metadata("design:type", Object)
], OpenMineTicketDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Не приходит чек на почту' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenMineTicketDto.prototype, "subject", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Оплатил заказ, чек не пришёл' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OpenMineTicketDto.prototype, "body", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['normal', 'high', 'urgent'], example: 'normal' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['normal', 'high', 'urgent']),
    __metadata("design:type", String)
], OpenMineTicketDto.prototype, "priority", void 0);
class TicketTransitionDto {
}
exports.TicketTransitionDto = TicketTransitionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: TRANSITION_TARGETS, example: 'in_progress' }),
    (0, class_validator_1.IsIn)(TRANSITION_TARGETS),
    __metadata("design:type", Object)
], TicketTransitionDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'support_agent_1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TicketTransitionDto.prototype, "assignee", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'support_agent_1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TicketTransitionDto.prototype, "actor", void 0);
class EscalateTicketDto {
}
exports.EscalateTicketDto = EscalateTicketDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'support_lead' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EscalateTicketDto.prototype, "actor", void 0);
//# sourceMappingURL=support.dto.js.map