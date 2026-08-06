"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ModerationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModerationService = void 0;
const common_1 = require("@nestjs/common");
const llm_client_1 = require("./llm/llm-client");
const llm_factory_1 = require("./llm/llm.factory");
const moderation_1 = require("./moderation");
let ModerationService = ModerationService_1 = class ModerationService {
    constructor() {
        this.logger = new common_1.Logger(ModerationService_1.name);
    }
    async moderate(text) {
        const trimmed = (text ?? '').trim();
        if (!trimmed)
            return { allowed: true, categories: [], reason: '', source: 'rules' };
        const fallback = (0, moderation_1.moderateByRules)(trimmed);
        const client = (0, llm_factory_1.resolveLlmClient)();
        if (!client?.supportsStructuredOutput)
            return fallback;
        try {
            const res = await client.chat((0, moderation_1.buildModerationMessages)(trimmed), {
                system: moderation_1.MODERATION_SYSTEM,
                cacheSystem: true,
                jsonSchema: moderation_1.MODERATION_SCHEMA,
                model: (0, llm_client_1.isAnthropic)(client) ? (0, llm_factory_1.fastModel)() : undefined,
                maxTokens: 300,
            });
            const coerced = (0, moderation_1.coerceModeration)(res.parsed, res.source);
            if (!coerced) {
                this.logger.warn(`LLM moderation returned off-schema output (source=${res.source}), using rules`);
                return fallback;
            }
            return coerced;
        }
        catch (err) {
            this.logger.warn(`LLM moderation failed, using rules: ${String(err)}`);
            return fallback;
        }
    }
};
exports.ModerationService = ModerationService;
exports.ModerationService = ModerationService = ModerationService_1 = __decorate([
    (0, common_1.Injectable)()
], ModerationService);
//# sourceMappingURL=moderation.service.js.map