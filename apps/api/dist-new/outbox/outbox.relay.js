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
var OutboxRelay_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxRelay = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const alerter_service_1 = require("../observability/alerter.service");
const prisma_service_1 = require("../prisma/prisma.service");
const outbox_service_1 = require("./outbox.service");
const QUEUE = 'outbox-relay';
const EVERY_MINUTE = '* * * * *';
const SCHEDULER_ID = 'outbox-relay-every-minute';
const HEARTBEAT_ID = 'outbox-relay';
let OutboxRelay = OutboxRelay_1 = class OutboxRelay {
    constructor(config, outbox, alerter, prisma) {
        this.config = config;
        this.outbox = outbox;
        this.alerter = alerter;
        this.prisma = prisma;
        this.logger = new common_1.Logger(OutboxRelay_1.name);
    }
    async onModuleInit() {
        if (this.config.get('OUTBOX_RELAY_ENABLED') !== 'true') {
            this.logger.log('Outbox relay disabled (set OUTBOX_RELAY_ENABLED=true to enable)');
            return;
        }
        if (this.config.get('JOB_BACKEND') === 'bullmq') {
            await this.startBullMq();
            return;
        }
        const connectionString = this.config.get('DATABASE_URL');
        if (!connectionString) {
            this.logger.warn('DATABASE_URL missing — outbox relay not started');
            return;
        }
        try {
            const { PgBoss } = await Promise.resolve().then(() => __importStar(require('pg-boss')));
            this.boss = new PgBoss(connectionString);
            this.boss.on('error', (err) => {
                this.logger.error('pg-boss error', err);
                this.alerter.notifyCritical({
                    source: HEARTBEAT_ID,
                    message: 'pg-boss error in outbox relay',
                    error: err,
                });
            });
            await this.boss.start();
            await this.boss.createQueue(QUEUE);
            await this.boss.work(QUEUE, async () => {
                const { sent, failed } = await this.outbox.relayPending();
                if (sent > 0 || failed > 0) {
                    this.logger.log(`Outbox relay: ${sent} sent, ${failed} failed`);
                }
                await this.heartbeat();
            });
            await this.boss.schedule(QUEUE, EVERY_MINUTE);
            this.logger.log('Outbox relay scheduled (every minute via pg-boss)');
        }
        catch (err) {
            this.boss = undefined;
            this.logger.error('Failed to start outbox relay', err);
            this.alerter.notifyCritical({
                source: HEARTBEAT_ID,
                message: 'Failed to start outbox relay',
                error: err,
            });
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
            const error = new Error('REDIS_URL is required for JOB_BACKEND=bullmq');
            if (processRole === 'worker')
                throw error;
            this.logger.error(error.message);
            return;
        }
        try {
            this.redis = new ioredis_1.default(redisUrl, {
                maxRetriesPerRequest: processRole === 'worker' ? null : 1,
            });
            if (processRole === 'worker') {
                this.worker = new bullmq_1.Worker(QUEUE, async () => {
                    const { sent, failed } = await this.outbox.relayPending();
                    if (sent > 0 || failed > 0) {
                        this.logger.log(`Outbox relay: ${sent} sent, ${failed} failed`);
                    }
                    await this.heartbeat();
                }, { connection: this.redis, concurrency: 1 });
                this.worker.on('error', (error) => {
                    this.logger.error('BullMQ outbox worker error', error);
                    this.alerter.notifyCritical({
                        source: HEARTBEAT_ID,
                        message: 'BullMQ outbox worker error',
                        error,
                    });
                });
                await this.worker.waitUntilReady();
                this.logger.log('BullMQ outbox worker ready');
                return;
            }
            this.queue = new bullmq_1.Queue(QUEUE, { connection: this.redis });
            await this.queue.waitUntilReady();
            await this.queue.upsertJobScheduler(SCHEDULER_ID, { every: 60_000 }, { name: QUEUE, opts: { attempts: 5, backoff: { type: 'exponential', delay: 5_000 } } });
            this.logger.log('BullMQ outbox schedule registered (every minute)');
        }
        catch (error) {
            await this.onModuleDestroy();
            this.worker = undefined;
            this.queue = undefined;
            this.redis = undefined;
            if (processRole === 'worker')
                throw error;
            this.logger.error('Failed to connect BullMQ outbox producer', error);
            this.alerter.notifyCritical({
                source: HEARTBEAT_ID,
                message: 'Failed to connect BullMQ outbox producer',
                error,
            });
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
};
exports.OutboxRelay = OutboxRelay;
exports.OutboxRelay = OutboxRelay = OutboxRelay_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        outbox_service_1.OutboxService,
        alerter_service_1.AlerterService,
        prisma_service_1.PrismaService])
], OutboxRelay);
//# sourceMappingURL=outbox.relay.js.map