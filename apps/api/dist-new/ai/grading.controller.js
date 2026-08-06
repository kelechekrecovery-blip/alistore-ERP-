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
exports.GradingController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const ai_read_decorator_1 = require("./ai-read.decorator");
const grading_dto_1 = require("./grading.dto");
const grading_service_1 = require("./grading.service");
let GradingController = class GradingController {
    constructor(grading) {
        this.grading = grading;
    }
    gradePhotos(dto) {
        return this.grading.grade(dto);
    }
};
exports.GradingController = GradingController;
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Фото-грейдинг Б/У устройства — keyless rules или vision/LLM при ключе',
        description: 'Для реального vision-анализа передавайте photos[].url (http(s) или локальный /uploads-путь) — грейдинг читает пиксели. ' +
            'Резолв по evidenceId пока не поддержан: фото без url оцениваются по меткам/анкете, иначе — keyless rules.',
    }),
    (0, swagger_1.ApiOkResponse)({ description: '{ source, grade, confidence, defects, notes, recommendedChecks }.' }),
    (0, common_1.Post)('grade-photos'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [grading_dto_1.GradePhotosDto]),
    __metadata("design:returntype", void 0)
], GradingController.prototype, "gradePhotos", null);
exports.GradingController = GradingController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, ai_read_decorator_1.AiReadGuard)(),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [grading_service_1.GradingService])
], GradingController);
//# sourceMappingURL=grading.controller.js.map