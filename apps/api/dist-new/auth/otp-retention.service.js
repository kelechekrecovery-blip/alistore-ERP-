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
var OtpRetentionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpRetentionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const SWEEP_INTERVAL_MS = 60 * 60_000;
const GRACE_MS = 24 * 60 * 60_000;
let OtpRetentionService = OtpRetentionService_1 = class OtpRetentionService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(OtpRetentionService_1.name);
    }
    onModuleInit() {
        void this.sweep();
        this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
        this.timer.unref();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    async purgeExpired(now = new Date()) {
        const cutoff = new Date(now.getTime() - GRACE_MS);
        const { count } = await this.prisma.otpChallenge.deleteMany({
            where: { expiresAt: { lt: cutoff } },
        });
        return { purged: count };
    }
    async sweep() {
        try {
            const { purged } = await this.purgeExpired();
            if (purged > 0)
                this.logger.log(`Стёрто просроченных OTP-challenge: ${purged}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'unknown otp retention error';
            this.logger.warn(`Уборка OTP-challenge не прошла: ${message}`);
        }
    }
};
exports.OtpRetentionService = OtpRetentionService;
exports.OtpRetentionService = OtpRetentionService = OtpRetentionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OtpRetentionService);
//# sourceMappingURL=otp-retention.service.js.map