import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError } from '../common/errors';
import { IngestCameraEventDto, RegisterEdgeDeviceDto } from './camera-gateway.dto';

@Injectable()
export class CameraGatewayService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async register(dto: RegisterEdgeDeviceDto, actor: string) {
    const point = await this.prisma.storePoint.findUnique({ where: { id: dto.storePointId }, select: { id: true } });
    if (!point) throw new NotFoundException('Store point not found');
    const secret = randomBytes(32).toString('base64url');
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

  async ingest(dto: IngestCameraEventDto, secret: string) {
    if (flag('EDGE_CAMERA_KILL_SWITCH')) throw new ForbiddenException('Camera ingestion disabled by safety kill switch');
    const device = await this.prisma.edgeDevice.findUnique({ where: { id: dto.deviceId } });
    if (!device || device.status !== 'active' || !safeSecret(secret, device.secretHash)) throw new ForbiddenException('Invalid edge device credentials');
    if (device.storePointId !== dto.storePointId) throw new ForbiddenException('Device/store point mismatch');
    assertMetadata(dto.value);
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new ForbiddenException('Invalid event timestamp');
    const retentionUntil = new Date(Date.now() + (dto.retentionHours ?? 72) * 60 * 60 * 1000);
    // Hash the caller's deterministic payload, not `retentionUntil` (which is
    // calculated from wall-clock time and would make a valid replay conflict).
    const requestHash = hashRequest({ ...dto, occurredAt: occurredAt.toISOString() });
    return this.audit.transaction(async (tx) => {
      const replay = await tx.cameraDetection.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (replay) {
        if (replay.edgeDeviceId !== device.id || replay.storePointId !== device.storePointId || replay.requestHash !== requestHash) {
          throw new ConflictError('camera_idempotency_key_reused', 'Idempotency key уже использован другим событием');
        }
        return { result: { eventId: replay.id, accepted: true, replay: true, action: 'review_required', retentionUntil: replay.retentionUntil }, events: [] };
      }
      const detectionId = randomUUID();
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "CameraDetection" ("id", "idempotencyKey", "requestHash", "edgeDeviceId", "storePointId", "eventType", "confidence", "value", "privacyLevel", "evidenceRef", "occurredAt", "retentionUntil", "createdAt")
        VALUES (${detectionId}, ${dto.idempotencyKey}, ${requestHash}, ${device.id}, ${device.storePointId}, ${dto.eventType}, ${dto.confidence}, ${JSON.stringify(dto.value)}::jsonb, ${dto.privacyLevel ?? 'non_identifying'}, ${dto.evidenceRef ?? null}, ${occurredAt}, ${retentionUntil}, NOW())
        ON CONFLICT ("idempotencyKey") DO NOTHING
        RETURNING "id"
      `;
      if (inserted.length === 0) {
        const concurrent = await tx.cameraDetection.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (!concurrent || concurrent.edgeDeviceId !== device.id || concurrent.storePointId !== device.storePointId || concurrent.requestHash !== requestHash) throw new ConflictError('camera_idempotency_key_reused', 'Idempotency key уже использован другим событием');
        return { result: { eventId: concurrent.id, accepted: true, replay: true, action: 'review_required', retentionUntil: concurrent.retentionUntil }, events: [] };
      }
      const detection = await tx.cameraDetection.findUniqueOrThrow({ where: { id: inserted[0].id } });
      await tx.edgeDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
      return { result: { eventId: detection.id, accepted: true, replay: false, action: 'review_required', retentionUntil }, events: [{ type: 'camera.detection_recorded', actor: `edge:${device.id}`, payload: { detectionId: detection.id, eventType: detection.eventType, confidence: detection.confidence, privacyLevel: detection.privacyLevel }, refs: [detection.id, device.id, device.storePointId] }] };
    });
  }
}

function hashSecret(secret: string): string { return createHash('sha256').update(secret).digest('hex'); }
function hashRequest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function assertMetadata(value: Record<string, unknown>): void {
  const encoded = JSON.stringify(value);
  if (encoded.length > 4_096) throw new ForbiddenException('Camera event metadata is too large');
  if (/(^|_|-)(frame|video|audio|image|base64|passport|document|face)(_|-|$)/i.test(encoded)) {
    throw new ForbiddenException('Raw or identifying camera data is not accepted');
  }
}
function safeSecret(secret: string, expected: string): boolean {
  const actual = Buffer.from(hashSecret(secret), 'hex');
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
function flag(name: string): boolean { return ['1', 'true', 'yes'].includes((process.env[name] ?? '').trim().toLowerCase()); }
