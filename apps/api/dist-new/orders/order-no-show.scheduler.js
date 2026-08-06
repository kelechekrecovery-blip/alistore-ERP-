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
var OrderNoShowScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderNoShowScheduler = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const alerter_service_1 = require("../observability/alerter.service");
const orders_service_1 = require("./orders.service");
const QUEUE = 'order-no-show-reminders';
const EVERY_MORNING = '15 9 * * *';
const ALERT_SOURCE = 'order-no-show-scheduler';
let OrderNoShowScheduler = OrderNoShowScheduler_1 = class OrderNoShowScheduler {
    constructor(config, orders, alerter) {
        this.config = config;
        this.orders = orders;
        this.alerter = alerter;
        this.logger = new common_1.Logger(OrderNoShowScheduler_1.name);
    }
    async onModuleInit() {
        if (this.config.get('PROCESS_ROLE') === 'worker')
            return;
        if (this.config.get('ORDER_NO_SHOW_REMINDERS_ENABLED') !== 'true')
            return;
        const connectionString = this.config.get('DATABASE_URL');
        if (!connectionString) {
            this.logger.warn('DATABASE_URL missing — no-show reminders not started');
            return;
        }
        try {
            const { PgBoss } = await Promise.resolve().then(() => __importStar(require('pg-boss')));
            this.boss = new PgBoss(connectionString);
            this.boss.on('error', (error) => this.logger.error('pg-boss error', error));
            await this.boss.start();
            await this.boss.createQueue(QUEUE);
            await this.boss.work(QUEUE, async () => {
                try {
                    const result = await this.orders.sweepNoShow();
                    if (result.reminders || result.ownerTasks) {
                        this.logger.log(`No-show sweep: ${result.reminders} reminder(s), ${result.ownerTasks} task(s)`);
                    }
                }
                catch (error) {
                    this.alerter.notifyCritical({
                        source: ALERT_SOURCE,
                        message: 'Order no-show sweep failed',
                        error,
                    });
                    throw error;
                }
            });
            await this.boss.schedule(QUEUE, EVERY_MORNING);
        }
        catch (error) {
            this.boss = undefined;
            this.alerter.notifyCritical({
                source: ALERT_SOURCE,
                message: 'Failed to start order no-show scheduler',
                error,
            });
        }
    }
    async onModuleDestroy() {
        await this.boss?.stop().catch(() => undefined);
    }
};
exports.OrderNoShowScheduler = OrderNoShowScheduler;
exports.OrderNoShowScheduler = OrderNoShowScheduler = OrderNoShowScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        orders_service_1.OrdersService,
        alerter_service_1.AlerterService])
], OrderNoShowScheduler);
//# sourceMappingURL=order-no-show.scheduler.js.map