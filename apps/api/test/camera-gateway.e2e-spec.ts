import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { CameraGatewayModule } from '../src/camera-gateway/camera-gateway.module';
import { CameraRetentionService } from '../src/camera-gateway/camera-retention.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Camera edge gateway', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let ownerToken: string;
  let sellerToken: string;
  let retention: CameraRetentionService;
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, CameraGatewayModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
    retention = moduleRef.get(CameraRetentionService);
    await staffAuth.createStaff(`camera-owner-${run}`, 'pass', 'owner');
    await staffAuth.createStaff(`camera-seller-${run}`, 'pass', 'seller');
    ownerToken = (await staffAuth.login(`camera-owner-${run}`, 'pass')).accessToken;
    sellerToken = (await staffAuth.login(`camera-seller-${run}`, 'pass')).accessToken;
  });

  beforeEach(async () => {
    await prisma.cameraDetection.deleteMany();
    await prisma.edgeDevice.deleteMany();
    await prisma.auditEvent.deleteMany();
    delete process.env.EDGE_CAMERA_KILL_SWITCH;
  });

  afterAll(async () => { await app.close(); });

  it('enrolls a device and accepts signed, idempotent metadata only', async () => {
    await request(app.getHttpServer()).post('/camera-gateway/devices').set('Authorization', `Bearer ${sellerToken}`).send({ name: 'EZVIZ checkout', storePointId: 'alistore-bishkek-1' }).expect(403);
    const enrolled = await request(app.getHttpServer()).post('/camera-gateway/devices').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'EZVIZ checkout', storePointId: 'alistore-bishkek-1' }).expect(201);
    expect(enrolled.body.secret).toEqual(expect.any(String));

    const payload = { idempotencyKey: `camera:${run}:1`, deviceId: enrolled.body.deviceId, storePointId: 'alistore-bishkek-1', eventType: 'queue_length_estimated', confidence: 0.86, value: { count: 4 }, occurredAt: new Date().toISOString(), retentionHours: 24 };
    const first = await request(app.getHttpServer()).post('/camera-gateway/events').set('x-edge-device-secret', enrolled.body.secret).send(payload).expect(201);
    expect(first.body).toEqual(expect.objectContaining({ accepted: true, replay: false, action: 'review_required' }));
    const replay = await request(app.getHttpServer()).post('/camera-gateway/events').set('x-edge-device-secret', enrolled.body.secret).send(payload).expect(201);
    expect(replay.body).toEqual(expect.objectContaining({ accepted: true, replay: true, eventId: first.body.eventId }));
    expect(await prisma.cameraDetection.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'camera.detection_recorded' } })).toBe(1);
  });

  it('rejects wrong secrets, mismatched points and the global camera kill switch', async () => {
    const enrolled = await request(app.getHttpServer()).post('/camera-gateway/devices').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'EZVIZ warehouse', storePointId: 'alistore-bishkek-1' }).expect(201);
    const payload = { idempotencyKey: `camera:${run}:2`, deviceId: enrolled.body.deviceId, storePointId: 'alistore-bishkek-1', eventType: 'camera_offline', confidence: 1, value: {}, occurredAt: new Date().toISOString() };
    await request(app.getHttpServer()).post('/camera-gateway/events').set('x-edge-device-secret', 'wrong').send(payload).expect(403);
    await request(app.getHttpServer()).post('/camera-gateway/events').set('x-edge-device-secret', enrolled.body.secret).send({ ...payload, storePointId: 'jest-bishkek-2' }).expect(403);
    process.env.EDGE_CAMERA_KILL_SWITCH = '1';
    await request(app.getHttpServer()).post('/camera-gateway/events').set('x-edge-device-secret', enrolled.body.secret).send(payload).expect(403);
    expect(await prisma.cameraDetection.count()).toBe(0);
  });

  it('purges expired metadata into an auditable tombstone', async () => {
    const enrolled = await request(app.getHttpServer()).post('/camera-gateway/devices').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'EZVIZ retention', storePointId: 'alistore-bishkek-1' }).expect(201);
    const payload = { idempotencyKey: `camera:${run}:3`, deviceId: enrolled.body.deviceId, storePointId: 'alistore-bishkek-1', eventType: 'camera_tamper_detected', confidence: 1, value: { zone: 'warehouse' }, occurredAt: new Date().toISOString(), retentionHours: 1 };
    const created = await request(app.getHttpServer()).post('/camera-gateway/events').set('x-edge-device-secret', enrolled.body.secret).send(payload).expect(201);
    await prisma.cameraDetection.update({ where: { id: created.body.eventId }, data: { retentionUntil: new Date(Date.now() - 1_000) } });
    expect(await retention.purgeExpired()).toBe(1);
    const purged = await prisma.cameraDetection.findUniqueOrThrow({ where: { id: created.body.eventId } });
    expect(purged.purgedAt).not.toBeNull();
    expect(purged.evidenceRef).toBeNull();
    expect(purged.value).toEqual({ purged: true });
    expect(await prisma.auditEvent.count({ where: { type: 'camera.detection_purged' } })).toBe(1);
  });

  it('handles concurrent duplicate events atomically', async () => {
    const enrolled = await request(app.getHttpServer()).post('/camera-gateway/devices').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'EZVIZ concurrent', storePointId: 'alistore-bishkek-1' }).expect(201);
    const payload = { idempotencyKey: `camera:${run}:4`, deviceId: enrolled.body.deviceId, storePointId: 'alistore-bishkek-1', eventType: 'queue_length_estimated', confidence: 0.9, value: { count: 2 }, occurredAt: new Date().toISOString() };
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/camera-gateway/events').set('x-edge-device-secret', enrolled.body.secret).send(payload),
      request(app.getHttpServer()).post('/camera-gateway/events').set('x-edge-device-secret', enrolled.body.secret).send(payload),
    ]);
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(responses.map((response) => response.body.eventId)).toEqual([responses[0].body.eventId, responses[0].body.eventId]);
    expect(await prisma.cameraDetection.count()).toBe(1);
  });
});
