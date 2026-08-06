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
var OwnerAlertsScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnerAlertsScheduler = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const owner_alerts_service_1 = require("./owner-alerts.service");
const alerter_service_1 = require("../observability/alerter.service");
const QUEUE = 'owner-alerts';
const EVERY_FIVE_MINUTES = '*/5 * * * *';
const ALERT_SOURCE = 'owner-alerts-scheduler';
let OwnerAlertsScheduler = OwnerAlertsScheduler_1 = class OwnerAlertsScheduler {
    constructor(config, alerts, alerter) {
        this.config = config;
        this.alerts = alerts;
        this.alerter = alerter;
        this.logger = new common_1.Logger(OwnerAlertsScheduler_1.name);
    }
    async onModuleInit() {
        if (this.config.get('PROCESS_ROLE') === 'worker')
            return;
        if (this.config.get('OWNER_ALERTS_ENABLED') !== 'true') {
            this.logger.log('Owner alerts disabled (set OWNER_ALERTS_ENABLED=true to enable)');
            return;
        }
        const connectionString = this.config.get('DATABASE_URL');
        if (!connectionString) {
            this.logger.warn('DATABASE_URL missing - owner alerts not started');
            return;
        }
        try {
            const { PgBoss } = await Promise.resolve().then(() => __importStar(require('pg-boss')));
            this.boss = new PgBoss(connectionString);
            this.boss.on('error', (err) => this.logger.error('pg-boss error', err));
            await this.boss.start();
            await this.boss.createQueue(QUEUE);
            await this.boss.work(QUEUE, async () => {
                try {
                    const { alerted } = await this.alerts.sweep();
                    if (alerted > 0) {
                        this.logger.log(`Enqueued ${alerted} owner alert(s)`);
                    }
                }
                catch (err) {
                    this.logger.error('Owner alert tick failed', err);
                    this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Owner alert tick failed', error: err });
                    throw err;
                }
            });
            await this.boss.schedule(QUEUE, EVERY_FIVE_MINUTES);
            this.logger.log('Owner alerts scheduled (every 5 minutes via pg-boss)');
        }
        catch (err) {
            this.boss = undefined;
            this.logger.error('Failed to start owner alerts', err);
            this.alerter.notifyCritical({ source: ALERT_SOURCE, message: 'Failed to start owner alerts', error: err });
        }
    }
    async onModuleDestroy() {
        await this.boss?.stop().catch(() => undefined);
    }
};
exports.OwnerAlertsScheduler = OwnerAlertsScheduler;
exports.OwnerAlertsScheduler = OwnerAlertsScheduler = OwnerAlertsScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        owner_alerts_service_1.OwnerAlertsService,
        alerter_service_1.AlerterService])
], OwnerAlertsScheduler);
//# sourceMappingURL=owner-alerts.scheduler.js.map