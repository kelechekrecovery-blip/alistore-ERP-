import { INestApplication, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { AuthzModule } from '../src/authz/authz.module';
import { FeatureFlagsModule } from '../src/feature-flags/feature-flags.module';
import {
  FEATURE_FLAGS,
  FeatureFlagKey,
  featureFlagDefinition,
} from '../src/feature-flags/feature-flags.registry';
import { FeatureFlagsService } from '../src/feature-flags/feature-flags.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { ProcurementModule } from '../src/procurement/procurement.module';

const ENV_NAMES = [
  'TO_ORDER_CHECKOUT_ENABLED',
  'SUPPLY_CANCELLATION_ENABLED',
  'SUPPLY_AUTO_REFUND_ENABLED',
  'SUPPLY_OWNER_RESOLUTION_ENABLED',
  'SUPPLY_PARTIAL_HANDOVER_ENABLED',
  'SUPPLY_QUARANTINE_CONVERSION_ENABLED',
] as const;

const STATE_KEYS = [
  'key',
  'description',
  'owner',
  'defaultEnabled',
  'legacyEnv',
  'enabled',
  'source',
  'fallback',
  'overrideActive',
  'overrideRevision',
].sort();

type LedgerState = { enabled: boolean; source: 'database' | 'environment' | 'default' };
type FeatureFlagEventPayload = {
  key: string;
  reason: string;
  before: LedgerState;
  after: LedgerState;
};

const featureFlagLockName = (key: string) => `feature-flag-override:${key}`;

describe('Feature flags (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let flags: FeatureFlagsService;
  const tokens: Record<string, string> = {};
  const originalEnvironment = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const name of ENV_NAMES) originalEnvironment.set(name, process.env[name]);

    prisma = new PrismaService();
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PrismaModule,
        AuditModule,
        AuthzModule,
        StaffAuthModule,
        FeatureFlagsModule,
        ProcurementModule,
      ],
    })
      .overrideProvider(PrismaService).useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    flags = app.get(FeatureFlagsService);

    const staffAuth = app.get(StaffAuthService);
    for (const role of ['owner', 'admin', 'seller', 'warehouse'] as const) {
      const username = `feature-flags-${role}-${Math.floor(Math.random() * 1_000_000)}`;
      await staffAuth.createStaff(username, 'pass', role);
      tokens[role] = (await staffAuth.login(username, 'pass')).accessToken;
    }
  });

  afterAll(async () => {
    await prisma.featureFlagOverride.deleteMany();
    await prisma.auditEvent.deleteMany({ where: { type: 'feature_flag.changed' } });
    await app.close();
    await prisma.$disconnect();
    for (const [name, value] of originalEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  beforeEach(async () => {
    await prisma.featureFlagOverride.deleteMany();
    await prisma.auditEvent.deleteMany({ where: { type: 'feature_flag.changed' } });
    for (const name of ENV_NAMES) delete process.env[name];
  });

  it('allowlists exactly the six existing supply flags and rejects unknown registry keys', () => {
    expect(FEATURE_FLAGS.map(({ key, legacyEnv, defaultEnabled }) => ({ key, legacyEnv, defaultEnabled })))
      .toEqual([
        { key: 'supply.to_order_checkout', legacyEnv: 'TO_ORDER_CHECKOUT_ENABLED', defaultEnabled: false },
        { key: 'supply.cancellation', legacyEnv: 'SUPPLY_CANCELLATION_ENABLED', defaultEnabled: false },
        { key: 'supply.auto_refund', legacyEnv: 'SUPPLY_AUTO_REFUND_ENABLED', defaultEnabled: false },
        { key: 'supply.owner_resolution', legacyEnv: 'SUPPLY_OWNER_RESOLUTION_ENABLED', defaultEnabled: false },
        { key: 'supply.partial_handover', legacyEnv: 'SUPPLY_PARTIAL_HANDOVER_ENABLED', defaultEnabled: false },
        { key: 'supply.quarantine_conversion', legacyEnv: 'SUPPLY_QUARANTINE_CONVERSION_ENABLED', defaultEnabled: false },
      ]);
    expect(() => featureFlagDefinition('provider.payment_certified'))
      .toThrow(UnprocessableEntityException);
  });

  it('fails closed by default and for an unknown run-time key', async () => {
    await expect(flags.isEnabled(FeatureFlagKey.ToOrderCheckout)).resolves.toBe(false);
    await expect(flags.isEnabled('unknown.flag')).resolves.toBe(false);

    const states = await flags.list();
    expect(states).toHaveLength(6);
    expect(states.every((state) => (
      state.enabled === false
      && state.source === 'default'
      && state.overrideActive === false
      && state.overrideRevision === null
      && state.fallback.enabled === false
      && state.fallback.source === 'default'
    ))).toBe(true);
  });

  it('retains legacy environment compatibility without exposing environment contents', async () => {
    process.env.SUPPLY_PARTIAL_HANDOVER_ENABLED = ' TRUE ';

    await expect(flags.isEnabled(FeatureFlagKey.PartialHandover)).resolves.toBe(true);
    const response = await request(app.getHttpServer())
      .get('/feature-flags')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const state = response.body.find((item: { key: string }) => item.key === FeatureFlagKey.PartialHandover);
    expect(Object.keys(state).sort()).toEqual(STATE_KEYS);
    expect(state).toEqual({
      ...FEATURE_FLAGS.find((definition) => definition.key === FeatureFlagKey.PartialHandover),
      enabled: true,
      source: 'environment',
      overrideActive: false,
      overrideRevision: null,
      fallback: { enabled: true, source: 'environment' },
    });
    expect(JSON.stringify(response.body)).not.toContain(' TRUE ');
  });

  it('gives the database override precedence and writes one secret-free ledger event', async () => {
    process.env.TO_ORDER_CHECKOUT_ENABLED = 'true';

    const response = await request(app.getHttpServer())
      .patch(`/feature-flags/${FeatureFlagKey.ToOrderCheckout}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ enabled: false, reason: 'Pause rollout after a checkout alert', expectedRevision: null })
      .expect(200);
    expect(Object.keys(response.body).sort()).toEqual(STATE_KEYS);
    expect(response.body).toEqual({
      ...FEATURE_FLAGS[0],
      enabled: false,
      source: 'database',
      overrideActive: true,
      overrideRevision: 1,
      fallback: { enabled: true, source: 'environment' },
    });
    await expect(flags.isEnabled(FeatureFlagKey.ToOrderCheckout)).resolves.toBe(false);

    const events = await prisma.auditEvent.findMany({
      where: { type: 'feature_flag.changed', refs: { has: FeatureFlagKey.ToOrderCheckout } },
    });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({
      key: FeatureFlagKey.ToOrderCheckout,
      reason: 'Pause rollout after a checkout alert',
      before: { enabled: true, source: 'environment' },
      after: { enabled: false, source: 'database' },
    });
    expect(JSON.stringify(events[0].payload)).not.toContain('TO_ORDER_CHECKOUT_ENABLED');
  });

  it('resets to environment/default evaluation and writes one event for the reset', async () => {
    process.env.SUPPLY_CANCELLATION_ENABLED = 'true';
    const setResponse = await request(app.getHttpServer())
      .patch(`/feature-flags/${FeatureFlagKey.Cancellation}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ enabled: false, reason: 'Hold cancellations', expectedRevision: null })
      .expect(200);

    const response = await request(app.getHttpServer())
      .delete(`/feature-flags/${FeatureFlagKey.Cancellation}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ reason: 'Restore deployment policy', expectedRevision: setResponse.body.overrideRevision })
      .expect(200);
    expect(response.body).toEqual({
      ...FEATURE_FLAGS[1],
      enabled: true,
      source: 'environment',
      overrideActive: false,
      overrideRevision: 2,
      fallback: { enabled: true, source: 'environment' },
    });
    await expect(flags.isEnabled(FeatureFlagKey.Cancellation)).resolves.toBe(true);
    expect(await prisma.featureFlagOverride.findUnique({
      where: { key: FeatureFlagKey.Cancellation },
    })).toMatchObject({ active: false, revision: 2 });

    const events = await prisma.auditEvent.findMany({
      where: { type: 'feature_flag.changed', refs: { has: FeatureFlagKey.Cancellation } },
      orderBy: { ts: 'asc' },
    });
    expect(events).toHaveLength(2);
    expect(events[1].payload).toEqual({
      key: FeatureFlagKey.Cancellation,
      reason: 'Restore deployment policy',
      before: { enabled: false, source: 'database' },
      after: { enabled: true, source: 'environment' },
    });
  });

  it('preserves a monotonic generation across reset/recreate and rejects stale ABA mutations', async () => {
    const key = FeatureFlagKey.AutoRefund;
    const revisionOne = await flags.set(key, true, 'Initial override', 'owner-initial', null);
    expect(revisionOne).toMatchObject({ enabled: true, source: 'database', overrideActive: true, overrideRevision: 1 });

    const tombstone = await flags.reset(key, 'Reset to fallback', 'owner-reset', 1);
    expect(tombstone).toMatchObject({ enabled: false, source: 'default', overrideActive: false, overrideRevision: 2 });

    const revisionThree = await flags.set(key, false, 'Recreate override', 'owner-recreate', 2);
    expect(revisionThree).toMatchObject({ enabled: false, source: 'database', overrideActive: true, overrideRevision: 3 });

    await expect(flags.set(key, true, 'Stale revision one set', 'owner-stale-set', 1))
      .rejects.toMatchObject({ code: 'feature_flag_revision_conflict', status: 409 });
    await expect(flags.reset(key, 'Stale revision one reset', 'owner-stale-reset', 1))
      .rejects.toMatchObject({ code: 'feature_flag_revision_conflict', status: 409 });

    await expect(flags.list()).resolves.toContainEqual(revisionThree);
    expect(await featureFlagEventPayloads(key)).toHaveLength(3);
  });

  it('treats populated pre-tombstone rows as active without requiring a backfill rewrite', async () => {
    const key = FeatureFlagKey.PartialHandover;
    await prisma.featureFlagOverride.create({
      data: { key, enabled: true, reason: 'Existing populated row', updatedBy: 'migration-compatibility' },
    });

    const [databaseRow] = await prisma.$queryRaw<Array<{ active: boolean; revision: number }>>`
      SELECT "active", "revision" FROM "FeatureFlagOverride" WHERE "key" = ${key}
    `;
    expect(databaseRow).toEqual({ active: true, revision: 1 });
    await expect(flags.list()).resolves.toContainEqual(expect.objectContaining({
      key,
      enabled: true,
      source: 'database',
      overrideActive: true,
      overrideRevision: 1,
    }));
  });

  it('serializes concurrent set/set mutations and rejects the stale tab', async () => {
    const key = FeatureFlagKey.QuarantineConversion;
    const { results, settledWhileHeld } = await runBehindHeldFeatureFlagLock(key, [
      () => flags.set(key, true, 'Concurrent enable', 'owner-enable', null),
      () => flags.set(key, false, 'Concurrent disable', 'owner-disable', null),
    ]);
    expect(settledWhileHeld).toBe(0);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(({ status }) => status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'feature_flag_revision_conflict', status: 409 });

    const finalState = (await flags.list()).find((state) => state.key === key)!;
    const payloads = await featureFlagEventPayloads(key);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      before: { enabled: false, source: 'default' },
      after: { enabled: finalState.enabled, source: 'database' },
    });
    expect(finalState.overrideRevision).toBe(1);
    expect(finalState.overrideActive).toBe(true);
  });

  it('serializes concurrent set/reset mutations and prevents a stale reset deleting a newer override', async () => {
    const key = FeatureFlagKey.OwnerResolution;
    await prisma.featureFlagOverride.create({
      data: { key, enabled: true, reason: 'Initial override', updatedBy: 'owner-initial' },
    });

    const { results, settledWhileHeld } = await runBehindHeldFeatureFlagLock(key, [
      () => flags.set(key, false, 'Concurrent set', 'owner-set', 1),
      () => flags.reset(key, 'Concurrent reset', 'owner-reset', 1),
    ]);
    expect(settledWhileHeld).toBe(0);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(({ status }) => status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'feature_flag_revision_conflict', status: 409 });

    const finalState = (await flags.list()).find((state) => state.key === key)!;
    const payloads = await featureFlagEventPayloads(key);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].before).toEqual({ enabled: true, source: 'database' });
    expect(payloads[0].after).toEqual({ enabled: finalState.enabled, source: finalState.source });
  });

  it('rejects unknown keys and a missing or whitespace-only reason without persisting', async () => {
    await request(app.getHttpServer())
      .patch('/feature-flags/unknown.flag')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ enabled: true, reason: 'not allowlisted', expectedRevision: null })
      .expect(422);
    await request(app.getHttpServer())
      .patch(`/feature-flags/${FeatureFlagKey.AutoRefund}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ enabled: true, expectedRevision: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/feature-flags/${FeatureFlagKey.AutoRefund}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ enabled: true, reason: 'Missing concurrency token' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/feature-flags/${FeatureFlagKey.AutoRefund}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ reason: '   ', expectedRevision: null })
      .expect(400);

    expect(await prisma.featureFlagOverride.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { type: 'feature_flag.changed' } })).toBe(0);
  });

  it('requires reports:read to list and owner settings permission to mutate', async () => {
    await request(app.getHttpServer())
      .get('/feature-flags')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/feature-flags')
      .set('Authorization', `Bearer ${tokens.seller}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/feature-flags/${FeatureFlagKey.OwnerResolution}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ enabled: true, reason: 'Admin must not change flags', expectedRevision: null })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/feature-flags/${FeatureFlagKey.OwnerResolution}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ reason: 'Admin must not reset flags', expectedRevision: null })
      .expect(403);
    await request(app.getHttpServer()).get('/feature-flags').expect(401);
  });

  it('keeps warehouse supply operations usable without leaking registry metadata or sources', async () => {
    process.env.TO_ORDER_CHECKOUT_ENABLED = 'true';
    const response = await request(app.getHttpServer())
      .get('/procurement/supply-operations')
      .set('Authorization', `Bearer ${tokens.warehouse}`)
      .expect(200);

    expect(response.body).not.toHaveProperty('flags');
    expect(response.body.capabilities).toEqual({
      financialQueuesVisible: false,
      ownerResolutionAvailable: false,
      toOrderCheckoutEnabled: true,
      cancellationEnabled: false,
    });
    const serialized = JSON.stringify(response.body);
    for (const forbidden of ['"source"', 'legacyEnv', 'overrideActive', 'overrideRevision', 'TO_ORDER_CHECKOUT_ENABLED']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  async function runBehindHeldFeatureFlagLock<T>(
    key: string,
    operations: Array<() => Promise<T>>,
  ): Promise<{ results: PromiseSettledResult<T>[]; settledWhileHeld: number }> {
    let signalAcquired!: () => void;
    let releaseLock!: () => void;
    const acquired = new Promise<void>((resolve) => { signalAcquired = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: number }>>`
        SELECT 1 AS "locked"
        FROM pg_advisory_xact_lock(hashtextextended(${featureFlagLockName(key)}, 0))
      `;
      signalAcquired();
      await release;
    });
    await acquired;

    let settled = 0;
    const pending = operations.map((operation) => {
      const promise = operation();
      void promise.then(
        () => { settled += 1; },
        () => { settled += 1; },
      );
      return promise;
    });
    await new Promise((resolve) => setTimeout(resolve, 75));
    const settledWhileHeld = settled;
    releaseLock();
    await holder;
    return { results: await Promise.allSettled(pending), settledWhileHeld };
  }

  async function featureFlagEventPayloads(key: string): Promise<FeatureFlagEventPayload[]> {
    const events = await prisma.auditEvent.findMany({
      where: { type: 'feature_flag.changed', refs: { has: key } },
    });
    return events.map((event) => event.payload as unknown as FeatureFlagEventPayload);
  }
});
