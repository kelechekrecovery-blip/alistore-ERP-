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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModerationController = exports.ModerateDto = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const ai_read_decorator_1 = require("./ai-read.decorator");
const moderation_service_1 = require("./moderation.service");
class ModerateDto {
}
exports.ModerateDto = ModerateDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ModerateDto.prototype, "text", void 0);
let ModerationController = class ModerationController {
    constructor(moderation) {
        this.moderation = moderation;
    }
    moderate(dto) {
        return this.moderation.moderate(dto.text);
    }
};
exports.ModerationController = ModerationController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Модерация текста (отзывы/CMS) — стоп-слова (keyless) или LLM-классификатор при ключе' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ allowed, categories, reason, source }.' }),
    (0, common_1.Post)('moderate'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ModerateDto]),
    __metadata("design:returntype", void 0)
], ModerationController.prototype, "moderate", null);
exports.ModerationController = ModerationController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, ai_read_decorator_1.AiReadGuard)(),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60_000 } }),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [moderation_service_1.ModerationService])
], ModerationController);
//# sourceMappingURL=moderation.controller.js.map