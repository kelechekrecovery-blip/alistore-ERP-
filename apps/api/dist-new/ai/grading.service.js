"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GradingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradingService = void 0;
const common_1 = require("@nestjs/common");
const grading_1 = require("./grading");
const image_resolver_1 = require("./llm/image-resolver");
const llm_factory_1 = require("./llm/llm.factory");
let GradingService = GradingService_1 = class GradingService {
    constructor() {
        this.logger = new common_1.Logger(GradingService_1.name);
    }
    async grade(input) {
        const fallback = (0, grading_1.gradePhotosByRules)(input);
        const client = (0, llm_factory_1.resolveLlmClient)();
        if (!client)
            return fallback;
        try {
            if (client.supportsVision) {
                const images = await (0, image_resolver_1.resolvePhotoImages)(input.photos);
                if (images.length > 0) {
                    let res = null;
                    try {
                        res = await client.chat((0, grading_1.buildVisionGradingMessages)(input, images), {
                            system: (0, grading_1.gradingSystemPrompt)(),
                            jsonSchema: grading_1.PHOTO_GRADING_SCHEMA,
                            maxTokens: 700,
                        });
                    }
                    catch (error) {
                        this.logger.warn(`vision grading transport failed, retrying from labels: ${String(error)}`);
                    }
                    if (res) {
                        return { source: res.source, ...(0, grading_1.parsePhotoGradingResponse)(res.text) };
                    }
                }
                this.logger.debug('vision grading: no photos resolved, grading from labels');
            }
            return await this.gradeFromLabels(input, client);
        }
        catch (err) {
            this.logger.warn(`AI photo grading failed, using rule fallback: ${String(err)}`);
            return { ...fallback, source: `${fallback.source} (fallback)` };
        }
    }
    async gradeFromLabels(input, client) {
        const [, user] = (0, grading_1.buildPhotoGradingMessages)(input);
        const res = await client.chat([{ role: 'user', content: user.content }], {
            system: (0, grading_1.gradingSystemPrompt)(),
            jsonSchema: grading_1.PHOTO_GRADING_SCHEMA,
            maxTokens: 700,
        });
        return { source: res.source, ...(0, grading_1.parsePhotoGradingResponse)(res.text) };
    }
};
exports.GradingService = GradingService;
exports.GradingService = GradingService = GradingService_1 = __decorate([
    (0, common_1.Injectable)()
], GradingService);
//# sourceMappingURL=grading.service.js.map