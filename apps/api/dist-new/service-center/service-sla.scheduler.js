"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ServiceSlaScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceSlaScheduler = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const service_sla_service_1 = require("./service-sla.service");
const alerter_service_1 = require("../observability/alerter.service");
const QUEUE = 'service-sla-sweep';
const SCHEDULER_ID = 'service-sla-every-minute';
const ALERT_SOURCE = 'service-sla-scheduler';
let ServiceSlaScheduler = ServiceSlaScheduler_1 = class ServiceSlaScheduler {
    constructor(config, sla, alerter) {
        this.config = config;
        this.sla = sla;
        this.alerter = alerter;
        this.logger = new common_1.Logger(ServiceSlaScheduler_1.name);
    }
    async onModuleInit() {
        if (this.config.get('SERVICE_SLA_SWEEP_ENABLED') !== 'true')
            return;
        if (this.config.get('JOB_BACKEND') === 'bullmq')
            return this.startBullMq();
        const databaseUrl = this.config.get('DATABASE_URL');
        if (!databaseUrl)
            return;
        try {
            const { PgBoss } = await Promise.resolve().then(() => __importStar(require('pg-boss')));
            this.boss = new PgBoss(databaseUrl);
            this.boss.on('error', (error) => this.logger.error('pg-boss SLA error', error));
            await this.boss.start();
            await this.boss.createQueue(QUEUE);
            await this.boss.work(QUEUE, async () => this.runSweep());
            await this.boss.schedule(QUEUE, '* * * * *');
        }
        catch (error) {
            this.boss = undefined;
            this.logger.error('Failed to start service SLA sweep', error);
            this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Failed to start service SLA sweep (pg-boss)', error });
        }
    }
    async onModuleDestroy() {
        await this.worker?.close().catch(() => undefined);
        await this.queue?.close().catch(() => undefined);
        await this.redis?.quit().catch(() => undefined);
        await this.boss?.stop().catch(() => undefined);
    }
    async startBullMq() {
        const redisUrl = this.config.get('REDIS_URL')?.trim();
        const processRole = this.config.get('PROCESS_ROLE') ?? 'api';
        if (!redisUrl) {
            if (processRole === 'worker')
                throw new Error('REDIS_URL is required for service SLA worker');
            return;
        }
        try {
            this.redis = new ioredis_1.default(redisUrl, { maxRetriesPerRequest: processRole === 'worker' ? null : 1 });
            if (processRole === 'worker') {
                this.worker = new bullmq_1.Worker(QUEUE, async () => this.runSweep(), { connection: this.redis, concurrency: 1 });
                this.worker.on('error', (error) => this.logger.error('BullMQ SLA worker error', error));
                await this.worker.waitUntilReady();
                return;
            }
            this.queue = new bullmq_1.Queue(QUEUE, { connection: this.redis });
            await this.queue.waitUntilReady();
            await this.queue.upsertJobScheduler(SCHEDULER_ID, { every: 60_000 }, { name: QUEUE, opts: { attempts: 5, backoff: { type: 'exponential', delay: 5_000 } } });
        }
        catch (error) {
            await this.onModuleDestroy();
            this.worker = undefined;
            this.queue = undefined;
            this.redis = undefined;
            this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Failed to connect BullMQ service SLA producer', error });
            if (processRole === 'worker')
                throw error;
            this.logger.error('Failed to connect BullMQ service SLA producer', error);
        }
    }
    async runSweep() {
        try {
            const { escalated } = await this.sla.escalateOverdue();
            const { escalated: overdueLoaners } = await this.sla.escalateOverdueLoaners();
            if (escalated > 0)
                this.logger.warn(`Escalated ${escalated} overdue service case(s)`);
            if (overdueLoaners > 0)
                this.logger.warn(`Escalated ${overdueLoaners} overdue loaner device(s)`);
        }
        catch (error) {
            this.logger.error('Service SLA sweep tick failed', error);
            this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Service SLA sweep tick failed', error });
            throw error;
        }
    }
};
exports.ServiceSlaScheduler = ServiceSlaScheduler;
exports.ServiceSlaScheduler = ServiceSlaScheduler = ServiceSlaScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        service_sla_service_1.ServiceSlaService,
        alerter_service_1.AlerterService])
], ServiceSlaScheduler);
//# sourceMappingURL=service-sla.scheduler.js.map