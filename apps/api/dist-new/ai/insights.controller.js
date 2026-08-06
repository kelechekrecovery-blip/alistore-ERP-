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
exports.InsightsController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const ai_read_decorator_1 = require("./ai-read.decorator");
const insights_service_1 = require("./insights.service");
let InsightsController = class InsightsController {
    constructor(insights) {
        this.insights = insights;
    }
    get() {
        return this.insights.insights();
    }
};
exports.InsightsController = InsightsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Owner AI assistant — insights derived from the Event Ledger' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ source, insights[] } — keyless rule engine (LLM when a key is set).' }),
    (0, common_1.Get)('insights'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InsightsController.prototype, "get", null);
exports.InsightsController = InsightsController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, ai_read_decorator_1.AiReadGuard)(),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [insights_service_1.InsightsService])
], InsightsController);
//# sourceMappingURL=insights.controller.js.map