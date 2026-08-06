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
exports.CameraGatewayService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const SIGNATURE_MAX_AGE_SECONDS = 300;
let CameraGatewayService = class CameraGatewayService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async register(dto, actor) {
        const point = await this.prisma.storePoint.findUnique({ where: { id: dto.storePointId }, select: { id: true } });
        if (!point)
            throw new common_1.NotFoundException('Store point not found');
        const secret = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        const device = await this.audit.transaction(async (tx) => {
            const created = await tx.edgeDevice.create({ data: {
                    storePointId: dto.storePointId,
                    kind: dto.kind ?? 'camera',
                    name: dto.name.trim(),
                    secretHash: hashSecret(secret),
                    createdBy: actor,
                } });
            return { result: created, events: [{ type: 'edge_device.enrolled', actor, payload: { deviceId: created.id, storePointId: created.storePointId, kind: created.kind }, refs: [created.id, created.storePointId] }] };
        });
        return { deviceId: device.id, storePointId: device.storePointId, secret };
    }
    async ingest(dto, secret, timestamp, signature) {
        if (flag('EDGE_CAMERA_KILL_SWITCH'))
            throw new common_1.ForbiddenException('Camera ingestion disabled by safety kill switch');
        const device = await this.prisma.edgeDevice.findUnique({ where: { id: dto.deviceId } });
        if (!device || device.status !== 'active' || !safeSecret(secret, device.secretHash))
            throw new common_1.ForbiddenException('Invalid edge device credentials');
        assertSignedRequest(dto, secret, timestamp, signature);
        if (device.storePointId !== dto.storePointId)
            throw new common_1.ForbiddenException('Device/store point mismatch');
        assertMetadata(dto.value);
        const occurredAt = new Date(dto.occurredAt);
        if (Number.isNaN(occurredAt.getTime()))
            throw new common_1.ForbiddenException('Invalid event timestamp');
        const retentionUntil = new Date(Date.now() + (dto.retentionHours ?? 72) * 60 * 60 * 1000);
        const requestHash = hashRequest({ ...dto, occurredAt: occurredAt.toISOString() });
        return this.audit.transaction(async (tx) => {
            const replay = await tx.cameraDetection.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
            if (replay) {
                if (replay.edgeDeviceId !== device.id || replay.storePointId !== device.storePointId || replay.requestHash !== requestHash) {
                    throw new errors_1.ConflictError('camera_idempotency_key_reused', 'Idempotency key уже использован другим событием');
                }
                return { result: { eventId: replay.id, accepted: true, replay: true, action: 'review_required', retentionUntil: replay.retentionUntil }, events: [] };
            }
            const detectionId = (0, node_crypto_1.randomUUID)();
            const inserted = await tx.$queryRaw `
        INSERT INTO "CameraDetection" ("id", "idempotencyKey", "requestHash", "edgeDeviceId", "storePointId", "eventType", "confidence", "value", "privacyLevel", "evidenceRef", "occurredAt", "retentionUntil", "createdAt")
        VALUES (${detectionId}, ${dto.idempotencyKey}, ${requestHash}, ${device.id}, ${device.storePointId}, ${dto.eventType}, ${dto.confidence}, ${JSON.stringify(dto.value)}::jsonb, ${dto.privacyLevel ?? 'non_identifying'}, ${dto.evidenceRef ?? null}, ${occurredAt}, ${retentionUntil}, NOW())
        ON CONFLICT ("idempotencyKey") DO NOTHING
        RETURNING "id"
      `;
            if (inserted.length === 0) {
                const concurrent = await tx.cameraDetection.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
                if (!concurrent || concurrent.edgeDeviceId !== device.id || concurrent.storePointId !== device.storePointId || concurrent.requestHash !== requestHash)
                    throw new errors_1.ConflictError('camera_idempotency_key_reused', 'Idempotency key уже использован другим событием');
                return { result: { eventId: concurrent.id, accepted: true, replay: true, action: 'review_required', retentionUntil: concurrent.retentionUntil }, events: [] };
            }
            const detection = await tx.cameraDetection.findUniqueOrThrow({ where: { id: inserted[0].id } });
            await tx.edgeDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
            return { result: { eventId: detection.id, accepted: true, replay: false, action: 'review_required', retentionUntil }, events: [{ type: 'camera.detection_recorded', actor: `edge:${device.id}`, payload: { detectionId: detection.id, eventType: detection.eventType, confidence: detection.confidence, privacyLevel: detection.privacyLevel }, refs: [detection.id, device.id, device.storePointId] }] };
        });
    }
};
exports.CameraGatewayService = CameraGatewayService;
exports.CameraGatewayService = CameraGatewayService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], CameraGatewayService);
function hashSecret(secret) { return (0, node_crypto_1.createHash)('sha256').update(secret).digest('hex'); }
function hashRequest(value) { return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(value)).digest('hex'); }
function assertSignedRequest(dto, secret, timestamp, signature) {
    const seconds = Number(timestamp);
    if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > SIGNATURE_MAX_AGE_SECONDS) {
        throw new common_1.ForbiddenException('Camera event signature expired');
    }
    const expected = (0, node_crypto_1.createHmac)('sha256', secret).update(`${seconds}.${canonicalJson(dto)}`).digest('hex');
    const actual = Buffer.from(signature.trim(), 'hex');
    const wanted = Buffer.from(expected, 'hex');
    if (actual.length !== wanted.length || !(0, node_crypto_1.timingSafeEqual)(actual, wanted)) {
        throw new common_1.ForbiddenException('Invalid camera event signature');
    }
}
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value).sort(([a], [b]) => compareKeys(a, b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function compareKeys(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function assertMetadata(value) {
    const encoded = JSON.stringify(value);
    if (encoded.length > 4_096)
        throw new common_1.ForbiddenException('Camera event metadata is too large');
    if (/(^|_|-)(frame|video|audio|image|base64|passport|document|face)(_|-|$)/i.test(encoded)) {
        throw new common_1.ForbiddenException('Raw or identifying camera data is not accepted');
    }
}
function safeSecret(secret, expected) {
    const actual = Buffer.from(hashSecret(secret), 'hex');
    const target = Buffer.from(expected, 'hex');
    return actual.length === target.length && (0, node_crypto_1.timingSafeEqual)(actual, target);
}
function flag(name) { return ['1', 'true', 'yes'].includes((process.env[name] ?? '').trim().toLowerCase()); }
//# sourceMappingURL=camera-gateway.service.js.map