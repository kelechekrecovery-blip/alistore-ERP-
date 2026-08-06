"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CategorizeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategorizeService = void 0;
const common_1 = require("@nestjs/common");
const categorize_1 = require("./categorize");
const llm_client_1 = require("./llm/llm-client");
const llm_factory_1 = require("./llm/llm.factory");
let CategorizeService = CategorizeService_1 = class CategorizeService {
    constructor() {
        this.logger = new common_1.Logger(CategorizeService_1.name);
    }
    async suggest(name, attrs = {}) {
        const fallback = (0, categorize_1.suggestCategory)(name, attrs);
        const client = (0, llm_factory_1.resolveLlmClient)();
        if (!client?.supportsStructuredOutput)
            return fallback;
        try {
            const res = await client.chat((0, categorize_1.buildCategorizeMessages)(name, attrs), {
                system: categorize_1.CATEGORIZE_SYSTEM,
                cacheSystem: true,
                jsonSchema: categorize_1.CATEGORIZE_SCHEMA,
                model: (0, llm_client_1.isAnthropic)(client) ? (0, llm_factory_1.fastModel)() : undefined,
                maxTokens: 400,
            });
            return (0, categorize_1.coerceCategorySuggestion)(res.parsed) ?? fallback;
        }
        catch (err) {
            this.logger.warn(`LLM categorize failed, using rules: ${String(err)}`);
            return fallback;
        }
    }
};
exports.CategorizeService = CategorizeService;
exports.CategorizeService = CategorizeService = CategorizeService_1 = __decorate([
    (0, common_1.Injectable)()
], CategorizeService);
//# sourceMappingURL=categorize.service.js.map