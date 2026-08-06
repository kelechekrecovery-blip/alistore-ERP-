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
      ],
    })
      .overrideProvider(PrismaService).useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    flags = app.get(FeatureFlagsService);

    const staffAuth = app.get(StaffAuthService);
    for (const role of ['owner', 'admin', 'seller'] as const) {
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
    expect(states.every((state) => state.enabled === false && state.source === 'default')).toBe(true);
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
    });
    expect(JSON.stringify(response.body)).not.toContain(' TRUE ');
  });

  it('gives the database override precedence and writes one secret-free ledger event', async () => {
    process.env.TO_ORDER_CHECKOUT_ENABLED = 'true';

    const response = await request(app.getHttpServer())
      .patch(`/feature-flags/${FeatureFlagKey.ToOrderCheckout}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ enabled: false, reason: 'Pause rollout after a checkout alert' })
      .expect(200);
    expect(Object.keys(response.body).sort()).toEqual(STATE_KEYS);
    expect(response.body).toEqual({
      ...FEATURE_FLAGS[0],
      enabled: false,
      source: 'database',
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
    await request(app.getHttpServer())
      .patch(`/feature-flags/${FeatureFlagKey.Cancellation}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ enabled: false, reason: 'Hold cancellations' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .delete(`/feature-flags/${FeatureFlagKey.Cancellation}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ reason: 'Restore deployment policy' })
      .expect(200);
    expect(response.body).toEqual({
      ...FEATURE_FLAGS[1],
      enabled: true,
      source: 'environment',
    });
    await expect(flags.isEnabled(FeatureFlagKey.Cancellation)).resolves.toBe(true);
    expect(await prisma.featureFlagOverride.findUnique({
      where: { key: FeatureFlagKey.Cancellation },
    })).toBeNull();

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

  it('serializes concurrent set/set mutations into a truthful ledger chain', async () => {
    const key = FeatureFlagKey.QuarantineConversion;
    const { settledWhileHeld } = await runBehindHeldFeatureFlagLock(key, [
      () => flags.set(key, true, 'Concurrent enable', 'owner-enable'),
      () => flags.set(key, false, 'Concurrent disable', 'owner-disable'),
    ]);
    expect(settledWhileHeld).toBe(0);

    const finalState = (await flags.list()).find((state) => state.key === key)!;
    const payloads = await featureFlagEventPayloads(key);
    assertTruthfulChain(payloads, { enabled: false, source: 'default' }, {
      enabled: finalState.enabled,
      source: finalState.source,
    });
  });

  it('serializes concurrent set/reset mutations into a truthful ledger chain', async () => {
    const key = FeatureFlagKey.OwnerResolution;
    await prisma.featureFlagOverride.create({
      data: { key, enabled: true, reason: 'Initial override', updatedBy: 'owner-initial' },
    });

    const { settledWhileHeld } = await runBehindHeldFeatureFlagLock(key, [
      () => flags.set(key, false, 'Concurrent set', 'owner-set'),
      () => flags.reset(key, 'Concurrent reset', 'owner-reset'),
    ]);
    expect(settledWhileHeld).toBe(0);

    const finalState = (await flags.list()).find((state) => state.key === key)!;
    const payloads = await featureFlagEventPayloads(key);
    assertTruthfulChain(payloads, { enabled: true, source: 'database' }, {
      enabled: finalState.enabled,
      source: finalState.source,
    });
  });

  it('rejects unknown keys and a missing or whitespace-only reason without persisting', async () => {
    await request(app.getHttpServer())
      .patch('/feature-flags/unknown.flag')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ enabled: true, reason: 'not allowlisted' })
      .expect(422);
    await request(app.getHttpServer())
      .patch(`/feature-flags/${FeatureFlagKey.AutoRefund}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ enabled: true })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/feature-flags/${FeatureFlagKey.AutoRefund}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ reason: '   ' })
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
      .send({ enabled: true, reason: 'Admin must not change flags' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/feature-flags/${FeatureFlagKey.OwnerResolution}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ reason: 'Admin must not reset flags' })
      .expect(403);
    await request(app.getHttpServer()).get('/feature-flags').expect(401);
  });

  async function runBehindHeldFeatureFlagLock<T>(
    key: string,
    operations: Array<() => Promise<T>>,
  ): Promise<{ results: T[]; settledWhileHeld: number }> {
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
    return { results: await Promise.all(pending), settledWhileHeld };
  }

  async function featureFlagEventPayloads(key: string): Promise<FeatureFlagEventPayload[]> {
    const events = await prisma.auditEvent.findMany({
      where: { type: 'feature_flag.changed', refs: { has: key } },
    });
    return events.map((event) => event.payload as unknown as FeatureFlagEventPayload);
  }

  function assertTruthfulChain(
    payloads: FeatureFlagEventPayload[],
    initial: LedgerState,
    final: LedgerState,
  ): void {
    expect(payloads).toHaveLength(2);
    const first = payloads.find((payload) => statesEqual(payload.before, initial));
    expect(first).toBeDefined();
    const second = payloads.find((payload) => payload !== first && statesEqual(payload.before, first!.after));
    expect(second).toBeDefined();
    expect(second!.after).toEqual(final);
  }

  function statesEqual(left: LedgerState, right: LedgerState): boolean {
    return left.enabled === right.enabled && left.source === right.source;
  }
});
