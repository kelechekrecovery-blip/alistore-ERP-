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
var DescribeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DescribeService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const describe_1 = require("./describe");
const llm_client_1 = require("./llm/llm-client");
const llm_factory_1 = require("./llm/llm.factory");
let DescribeService = DescribeService_1 = class DescribeService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DescribeService_1.name);
    }
    async describe(dto) {
        const input = await this.resolve(dto);
        const client = (0, llm_factory_1.resolveLlmClient)();
        if (!client)
            return (0, describe_1.buildDescription)(input);
        const [system, user] = (0, describe_1.buildDescriptionMessages)(input);
        try {
            const res = await client.chat([{ role: 'user', content: user.content }], {
                system: system.content,
                cacheSystem: true,
                model: (0, llm_client_1.isAnthropic)(client) ? (0, llm_factory_1.fastModel)() : undefined,
                maxTokens: 400,
            });
            const description = res.text.trim();
            if (!description)
                throw new Error('empty LLM description');
            return { description, source: res.source, highlights: (0, describe_1.buildDescription)(input).highlights };
        }
        catch (err) {
            this.logger.warn(`LLM describe failed, using template: ${String(err)}`);
            return (0, describe_1.buildDescription)(input);
        }
    }
    async resolve(dto) {
        if (dto.sku) {
            const product = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
            if (!product)
                throw new errors_1.ValidationError('product_not_found', `SKU ${dto.sku} не найден`);
            return { name: product.name, category: product.category, attrs: product.attrs ?? {} };
        }
        if (!dto.name)
            throw new errors_1.ValidationError('name_required', 'Укажите sku или name');
        return { name: dto.name, category: dto.category, attrs: dto.attrs ?? {} };
    }
};
exports.DescribeService = DescribeService;
exports.DescribeService = DescribeService = DescribeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DescribeService);
//# sourceMappingURL=describe.service.js.map