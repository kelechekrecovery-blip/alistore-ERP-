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
exports.AiOrchestratorController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const ai_read_decorator_1 = require("./ai-read.decorator");
const orchestrator_dto_1 = require("./orchestrator.dto");
const orchestrator_service_1 = require("./orchestrator.service");
let AiOrchestratorController = class AiOrchestratorController {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    run(dto, user) {
        return this.orchestrator.run(dto, user);
    }
    get(id, user) {
        return this.orchestrator.getRun(id, user);
    }
};
exports.AiOrchestratorController = AiOrchestratorController;
__decorate([
    (0, common_1.Post)('runs'),
    (0, swagger_1.ApiOperation)({ summary: 'Запустить read-only AI tool с durable trace и decision' }),
    (0, swagger_1.ApiOkResponse)({ description: 'AI run, decision и typed tool output' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [orchestrator_dto_1.CreateAiRunDto, Object]),
    __metadata("design:returntype", void 0)
], AiOrchestratorController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('runs/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Получить собственный AI run с шагами и источниками' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AiOrchestratorController.prototype, "get", null);
exports.AiOrchestratorController = AiOrchestratorController = __decorate([
    (0, swagger_1.ApiTags)('ai-orchestrator'),
    (0, ai_read_decorator_1.AiReadGuard)(),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    (0, common_1.Controller)('ai/orchestrator'),
    __metadata("design:paramtypes", [orchestrator_service_1.AiOrchestratorService])
], AiOrchestratorController);
//# sourceMappingURL=orchestrator.controller.js.map