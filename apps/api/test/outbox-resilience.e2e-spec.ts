import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditService } from '../src/audit/audit.service';
import { ConflictError, ValidationError } from '../src/common/errors';
import { OutboxModule } from '../src/outbox/outbox.module';
import { OutboxService } from '../src/outbox/outbox.service';
import {
  DeliverableMessage,
  NotificationTransport,
} from '../src/outbox/outbox.types';
import { ExpoPushTransport } from '../src/outbox/transports/expo-push.transport';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

/** Test transport that records deliveries and can be made to fail. */
class RecordingTransport implements NotificationTransport {
  calls: DeliverableMessage[] = [];
  fail = false;
  async deliver(message: DeliverableMessage): Promise<void> {
    this.calls.push(message);
    if (this.fail) throw new Error('transport boom');
  }
}

/**
 * LOGIC-013 outbox resilience: exponential backoff between retries, operator
 * re-drive of parked (failed) messages, and a push to a recipient without
 * device tokens must end as a visible failure — never as `sent`.
 */
describe('Outbox resilience (integration)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
  });

  it('backs off exponentially and skips messages whose next attempt is not due', async () => {
    const transport = new RecordingTransport();
    transport.fail = true;
    const outbox = new OutboxService(prisma, transport);
    await outbox.enqueue({
      channel: 'email',
      recipient: 'backoff@b.kg',
      template: 'backoff_probe',
    });

    // Attempt 1 fails → next retry scheduled with the base delay (~5s).
    let before = Date.now();
    await outbox.relayPending();
    let row = await prisma.outboxMessage.findFirstOrThrow({
      where: { template: 'backoff_probe' },
    });
    expect(row.attempts).toBe(1);
    expect(row.status).toBe('pending');
    const delay1 = row.nextAttemptAt!.getTime() - before;
    expect(delay1).toBeGreaterThanOrEqual(4_000);
    expect(delay1).toBeLessThanOrEqual(7_000);

    // Not yet eligible → the relay pass must skip it entirely.
    const skipped = await outbox.relayPending();
    expect(skipped).toEqual({ sent: 0, failed: 0 });
    expect(transport.calls).toHaveLength(1);

    // Attempt 2 → the delay grows (~10s).
    await prisma.outboxMessage.updateMany({
      where: { template: 'backoff_probe' },
      data: { nextAttemptAt: new Date(0) },
    });
    before = Date.now();
    await outbox.relayPending();
    row = await prisma.outboxMessage.findFirstOrThrow({
      where: { template: 'backoff_probe' },
    });
    expect(row.attempts).toBe(2);
    const delay2 = row.nextAttemptAt!.getTime() - before;
    expect(delay2).toBeGreaterThan(delay1);
    expect(delay2).toBeGreaterThanOrEqual(8_000);

    // Attempt 3 → the delay keeps growing (~20s).
    await prisma.outboxMessage.updateMany({
      where: { template: 'backoff_probe' },
      data: { nextAttemptAt: new Date(0) },
    });
    before = Date.now();
    await outbox.relayPending();
    row = await prisma.outboxMessage.findFirstOrThrow({
      where: { template: 'backoff_probe' },
    });
    expect(row.attempts).toBe(3);
    const delay3 = row.nextAttemptAt!.getTime() - before;
    expect(delay3).toBeGreaterThan(delay2);
    expect(delay3).toBeGreaterThanOrEqual(16_000);
  });

  it('re-drive returns a failed message to the queue with a ledger event', async () => {
    const audit = new AuditService(prisma);
    const transport = new RecordingTransport();
    transport.fail = true;
    const outbox = new OutboxService(prisma, transport, audit);
    await outbox.enqueue({
      channel: 'sms',
      recipient: '+996700000099',
      template: 'redrive_me',
    });

    for (let i = 0; i < 5; i += 1) {
      await prisma.outboxMessage.updateMany({
        where: { template: 'redrive_me' },
        data: { nextAttemptAt: new Date(0) },
      });
      await outbox.relayPending();
    }
    let row = await prisma.outboxMessage.findFirstOrThrow({
      where: { template: 'redrive_me' },
    });
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(5);

    // Parked: the relay never touches failed rows on its own.
    const parked = await outbox.relayPending();
    expect(parked).toEqual({ sent: 0, failed: 0 });
    expect(transport.calls).toHaveLength(5);

    const redriven = await outbox.redrive(row.id, 'owner-test');
    expect(redriven.status).toBe('pending');
    expect(redriven.attempts).toBe(0);
    expect(redriven.lastError).toBeNull();
    expect(redriven.nextAttemptAt!.getTime()).toBeLessThanOrEqual(Date.now());

    const event = await prisma.auditEvent.findFirst({
      where: { type: 'outbox.redriven', refs: { has: row.id } },
    });
    expect(event).not.toBeNull();
    expect(event?.actor).toBe('owner-test');

    // Once the transport recovers, the re-driven message is delivered.
    transport.fail = false;
    const relayed = await outbox.relayPending();
    expect(relayed.sent).toBe(1);
    row = await prisma.outboxMessage.findFirstOrThrow({
      where: { template: 'redrive_me' },
    });
    expect(row.status).toBe('sent');
  });

  it('rejects re-drive for messages that are not failed (no duplicate enqueue)', async () => {
    const outbox = new OutboxService(prisma, new RecordingTransport(), new AuditService(prisma));
    await outbox.enqueue({
      channel: 'sms',
      recipient: '+996700000098',
      template: 'not_failed_yet',
    });
    const row = await prisma.outboxMessage.findFirstOrThrow({
      where: { template: 'not_failed_yet' },
    });

    await expect(outbox.redrive(row.id, 'owner-test')).rejects.toBeInstanceOf(ConflictError);
    await expect(outbox.redrive('missing-id', 'owner-test')).rejects.toBeInstanceOf(ValidationError);

    const events = await prisma.auditEvent.count({
      where: { type: 'outbox.redriven', refs: { has: row.id } },
    });
    expect(events).toBe(0);
  });

  it('parks a push to a recipient with no device tokens as failed, never sent', async () => {
    const expo = new ExpoPushTransport(
      {
        get: (key: string) =>
          ({ EXPO_PUSH_API_URL: 'https://expo.test/--/api/v2/push/send' })[key],
      } as unknown as ConfigService,
      prisma,
    );
    const outbox = new OutboxService(prisma, expo);
    await outbox.enqueue({
      channel: 'push',
      recipient: 'customer-without-devices',
      template: 'zero_token_probe',
      payload: { message: 'hi' },
    });

    let sentCount = 0;
    for (let i = 0; i < 5; i += 1) {
      await prisma.outboxMessage.updateMany({
        where: { template: 'zero_token_probe' },
        data: { nextAttemptAt: new Date(0) },
      });
      const pass = await outbox.relayPending();
      sentCount += pass.sent;
    }

    const row = await prisma.outboxMessage.findFirstOrThrow({
      where: { template: 'zero_token_probe' },
    });
    expect(sentCount).toBe(0);
    expect(row.status).toBe('failed');
    expect(row.sentAt).toBeNull();
    expect(row.lastError).toContain('push_recipient_unavailable');
  });
});

describe('POST /outbox/:id/redrive (RBAC)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminId: string;
  let cashierToken: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        StaffAuthModule,
        OutboxModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'admin' | 'cashier') => {
      const username = `${role}-outbox-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const admin = await createSession('admin');
    adminId = admin.id;
    adminToken = admin.token;
    cashierToken = (await createSession('cashier')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
  });

  it('lets admin/owner re-drive a failed message; rejects cashier and guests', async () => {
    const failed = await prisma.outboxMessage.create({
      data: {
        channel: 'sms',
        recipient: '+996700000042',
        template: 'rbac_redrive',
        payload: {},
        status: 'failed',
        attempts: 5,
        lastError: 'provider boom',
      },
    });

    await request(app.getHttpServer())
      .post(`/outbox/${failed.id}/redrive`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/outbox/${failed.id}/redrive`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/outbox/${failed.id}/redrive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const row = await prisma.outboxMessage.findUniqueOrThrow({
      where: { id: failed.id },
    });
    expect(row).toMatchObject({ status: 'pending', attempts: 0, lastError: null });
    expect(row.nextAttemptAt!.getTime()).toBeLessThanOrEqual(Date.now());

    const event = await prisma.auditEvent.findFirst({
      where: { type: 'outbox.redriven', refs: { has: failed.id } },
    });
    expect(event?.actor).toBe(adminId);

    // A repeated re-drive of an already-queued message is a 409, not a duplicate.
    await request(app.getHttpServer())
      .post(`/outbox/${failed.id}/redrive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    const events = await prisma.auditEvent.count({
      where: { type: 'outbox.redriven', refs: { has: failed.id } },
    });
    expect(events).toBe(1);
  });
});
