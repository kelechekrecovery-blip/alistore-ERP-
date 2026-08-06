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
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const analytics_events_1 = require("./analytics-events");
const MAX_PROPS_BYTES = 4000;
let AnalyticsService = class AnalyticsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async record(dto) {
        if (!(0, analytics_events_1.isAnalyticsEventType)(dto.type)) {
            throw new errors_1.ValidationError('analytics_unknown_event_type', `Неизвестный тип события: ${dto.type}`);
        }
        const props = dto.props ?? {};
        if (JSON.stringify(props).length > MAX_PROPS_BYTES) {
            throw new errors_1.ValidationError('analytics_payload_too_large', 'Слишком большой контекст события');
        }
        await this.prisma.analyticsEvent.create({
            data: {
                type: dto.type,
                sessionId: dto.sessionId,
                productId: dto.productId ?? null,
                source: dto.source ?? null,
                payload: props,
            },
        });
    }
    async funnel(from, to) {
        const grouped = await this.prisma.analyticsEvent.groupBy({
            by: ['type', 'source'],
            where: { ts: { gte: from, lte: to } },
            _count: { _all: true },
        });
        const stage = () => ({ productViews: 0, addToCarts: 0, checkoutsStarted: 0 });
        const add = (bucket, type, n) => {
            if (type === 'product_view')
                bucket.productViews += n;
            else if (type === 'add_to_cart')
                bucket.addToCarts += n;
            else if (type === 'checkout_started')
                bucket.checkoutsStarted += n;
        };
        const overall = stage();
        const bySource = {};
        for (const row of grouped) {
            const n = row._count._all;
            add(overall, row.type, n);
            const key = row.source ?? '(direct)';
            add((bySource[key] ??= stage()), row.type, n);
        }
        return { from: from.toISOString(), to: to.toISOString(), ...overall, bySource };
    }
    get eventTypes() {
        return analytics_events_1.ANALYTICS_EVENT_TYPES;
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map