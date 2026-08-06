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
var RefundRelay_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundRelay = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const alerter_service_1 = require("../observability/alerter.service");
const prisma_service_1 = require("../prisma/prisma.service");
const refunds_constants_1 = require("./refunds.constants");
const refunds_processor_1 = require("./refunds.processor");
const HEARTBEAT_ID = 'refund-relay';
let RefundRelay = RefundRelay_1 = class RefundRelay {
    constructor(config, processor, alerter, prisma) {
        this.config = config;
        this.processor = processor;
        this.alerter = alerter;
        this.prisma = prisma;
        this.logger = new common_1.Logger(RefundRelay_1.name);
        this.running = false;
    }
    onModuleInit() {
        if (this.config.get('REFUND_RELAY_ENABLED') !== 'true')
            return;
        if (this.config.get('PROCESS_ROLE') !== 'worker')
            return;
        this.timer = setInterval(() => void this.tick(), 15_000);
        this.timer.unref();
        void this.tick();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    async tick() {
        if (this.running)
            return;
        this.running = true;
        try {
            const swept = await this.processor.sweepStaleProviderPending(this.staleMs());
            if (swept > 0)
                this.logger.log(`Parked ${swept} stale provider-pending refund allocation(s)`);
            const processed = await this.processor.processPending();
            if (processed > 0)
                this.logger.log(`Processed ${processed} refund aggregate(s)`);
        }
        catch (error) {
            this.logger.error('Refund relay iteration failed', error);
            this.alerter.notifyCritical({
                source: HEARTBEAT_ID,
                message: 'Refund relay iteration failed',
                error,
            });
        }
        finally {
            this.running = false;
            await this.heartbeat();
        }
    }
    async heartbeat() {
        try {
            await this.prisma.workerHeartbeat.upsert({
                where: { id: HEARTBEAT_ID },
                update: {},
                create: { id: HEARTBEAT_ID },
            });
        }
        catch (error) {
            this.logger.warn(`Heartbeat write failed: ${error.message}`);
        }
    }
    staleMs() {
        const raw = Number(this.config.get('REFUND_PROVIDER_PENDING_STALE_MS'));
        return Number.isSafeInteger(raw) && raw >= 60_000 ? raw : refunds_constants_1.DEFAULT_PROVIDER_PENDING_STALE_MS;
    }
};
exports.RefundRelay = RefundRelay;
exports.RefundRelay = RefundRelay = RefundRelay_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        refunds_processor_1.RefundProcessor,
        alerter_service_1.AlerterService,
        prisma_service_1.PrismaService])
], RefundRelay);
//# sourceMappingURL=refunds.relay.js.map