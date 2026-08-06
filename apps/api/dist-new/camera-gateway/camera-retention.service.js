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
var CameraRetentionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CameraRetentionService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const prisma_service_1 = require("../prisma/prisma.service");
const SWEEP_MS = 60 * 60_000;
let CameraRetentionService = CameraRetentionService_1 = class CameraRetentionService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
        this.logger = new common_1.Logger(CameraRetentionService_1.name);
    }
    onModuleInit() { void this.purgeExpired(); this.timer = setInterval(() => void this.purgeExpired(), SWEEP_MS); this.timer.unref(); }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
    async purgeExpired(now = new Date(), limit = 100) {
        const rows = await this.prisma.cameraDetection.findMany({ where: { purgedAt: null, retentionUntil: { lte: now } }, select: { id: true, storePointId: true, edgeDeviceId: true }, take: limit });
        let purged = 0;
        for (const row of rows) {
            const result = await this.audit.transaction(async (tx) => {
                const updated = await tx.cameraDetection.updateMany({ where: { id: row.id, purgedAt: null, retentionUntil: { lte: now } }, data: { value: { purged: true }, evidenceRef: null, purgedAt: new Date(), purgeReason: 'retention_expired' } });
                return { result: updated.count === 1, events: updated.count === 1 ? [{ type: 'camera.detection_purged', actor: 'system:camera-retention', payload: { detectionId: row.id, reason: 'retention_expired' }, refs: [row.id, row.edgeDeviceId, row.storePointId] }] : [] };
            });
            if (result)
                purged += 1;
        }
        if (rows.length > 0 && purged < rows.length)
            this.logger.warn(`Camera retention purged ${purged}/${rows.length}`);
        return purged;
    }
};
exports.CameraRetentionService = CameraRetentionService;
exports.CameraRetentionService = CameraRetentionService = CameraRetentionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], CameraRetentionService);
//# sourceMappingURL=camera-retention.service.js.map