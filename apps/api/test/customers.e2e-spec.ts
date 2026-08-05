import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';
import { AuditService } from '../src/audit/audit.service';
import { CustomersService } from '../src/customers/customers.service';

/** Guest-checkout customers: find-or-create is idempotent by phone. */
describe('Customers find-or-create (integration)', () => {
  let prisma: PrismaService;
  let customers: CustomersService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    customers = new CustomersService(prisma, new AuditService(prisma), new SettingsService(prisma, new AuditService(prisma)));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  it('creates a customer on first checkout and reuses it on the next', async () => {
    const first = await customers.upsert({ phone: '996700111222', name: 'Айбек' });
    const again = await customers.upsert({ phone: '+996700111222', name: 'Айбек Т.' });

    expect(again.id).toBe(first.id);
    expect(again.name).toBe('Айбек Т.'); // name updated when provided

    const count = await prisma.customer.count({ where: { phone: '+996700111222' } });
    expect(count).toBe(1);
  });

  it('does not issue a guest capability for an existing customer', async () => {
    await customers.upsert({ phone: '+996700111333', name: 'Закрытый профиль' });

    await expect(customers.createGuest({ phone: '996700111333', name: 'Подмена' }, '11111111-1111-4111-8111-111111111111'))
      .rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'guest_customer_requires_auth' }),
      });

    await expect(prisma.customer.findUnique({ where: { phone: '+996700111333' } }))
      .resolves.toMatchObject({ name: 'Закрытый профиль' });
  });

  it('adopts a legacy no-plus row without changing customer identity', async () => {
    const legacy = await prisma.customer.create({ data: { phone: '996700111444', name: 'Legacy' } });

    const canonical = await customers.upsert({ phone: '+996700111444', name: 'Canonical' });

    expect(canonical.id).toBe(legacy.id);
    expect(canonical.phone).toBe('+996700111444');
    expect(canonical.name).toBe('Canonical');
    expect(await prisma.customer.count({ where: { phone: { in: ['996700111444', '+996700111444'] } } })).toBe(1);
  });

  it('serializes concurrent guest creation across plus and no-plus aliases', async () => {
    const results = await Promise.allSettled([
      customers.createGuest({ phone: '+996700111555', name: 'First' }, '22222222-2222-4222-8222-222222222222'),
      customers.createGuest({ phone: '996700111555', name: 'Second' }, '33333333-3333-4333-8333-333333333333'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.customer.count({ where: { phone: '+996700111555' } })).toBe(1);
    expect(await prisma.customer.count({ where: { phone: '996700111555' } })).toBe(0);
  });

  it('replays a lost guest-create response by key without exposing another account', async () => {
    const key = '44444444-4444-4444-8444-444444444444';
    const first = await customers.createGuest({ phone: '996700111556', name: 'Replay Guest' }, key);
    const replay = await customers.createGuest({ phone: '+996700111556', name: 'Replay Guest' }, key);

    expect(replay.customer.id).toBe(first.customer.id);
    expect(replay.expiresAt).toEqual(first.expiresAt);
    expect(await prisma.customer.count({ where: { phone: '+996700111556' } })).toBe(1);
    await expect(customers.createGuest({ phone: '+996700111557', name: 'Other' }, key))
      .rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'idempotency_key_reused' }) });
  });

  it('serializes concurrent retries of the same guest command', async () => {
    const results = await Promise.all([
      customers.createGuest({ phone: '+996700111558', name: 'Concurrent Replay' }, '55555555-5555-4555-8555-555555555555'),
      customers.createGuest({ phone: '996700111558', name: 'Concurrent Replay' }, '55555555-5555-4555-8555-555555555555'),
    ]);
    expect(new Set(results.map((result) => result.customer.id))).toHaveProperty('size', 1);
    expect(await prisma.customer.count({ where: { phone: '+996700111558' } })).toBe(1);
  });

  it('refuses guest command replay after its capability window expires', async () => {
    const key = '66666666-6666-4666-8666-666666666666';
    const created = await customers.createGuest({ phone: '+996700111559', name: 'Expired Guest' }, key);
    await prisma.customer.update({
      where: { id: created.customer.id },
      data: { guestCreateExpiresAt: new Date(Date.now() - 1) },
    });
    await expect(customers.createGuest({ phone: '996700111559', name: 'Expired Guest' }, key))
      .rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'guest_customer_replay_expired' }) });
  });

  it('temporarily accepts a missing key once for installed-client compatibility', async () => {
    const created = await customers.createGuest({ phone: '+996700111560', name: 'Legacy Client' }, '');
    expect(created.customer).toMatchObject({ phone: '+996700111560', guestCreateKeyHash: null });
    await expect(customers.createGuest({ phone: '996700111560', name: 'Legacy Client' }, ''))
      .rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'guest_customer_requires_auth' }) });
  });

  it('rejects predictable supplied replay keys before writing', async () => {
    for (const key of ['1', 'guest-123', '77777777-7777-1777-8777-777777777777']) {
      await expect(customers.createGuest({ phone: '+996700111560', name: 'Weak Key' }, key))
        .rejects.toMatchObject({ status: 422, response: expect.objectContaining({ code: 'idempotency_key_invalid' }) });
    }
    expect(await prisma.customer.count({ where: { name: 'Weak Key' } })).toBe(0);
  });

  it('recovers the canonical winner when another phone writer wins the unique race', async () => {
    const winner = await prisma.customer.create({ data: { phone: '+996700111666', name: 'Auth winner' } });
    jest.spyOn(prisma, '$transaction').mockRejectedValueOnce({ code: 'P2002' });

    const recovered = await customers.upsert({ phone: '996700111666', name: 'POS update' });

    expect(recovered.id).toBe(winner.id);
    expect(recovered.name).toBe('POS update');
    expect(await prisma.customer.count({ where: { phone: '+996700111666' } })).toBe(1);
  });

  it('resolves staff intake aliases without overwriting an established profile', async () => {
    const existing = await prisma.customer.create({ data: { phone: '996700111667', name: 'Account Owner' } });
    const adopted = await customers.resolveForStaff({ phone: '+996700111667', name: 'Intake Override' });
    expect(adopted).toMatchObject({ id: existing.id, phone: '+996700111667', name: 'Account Owner' });

    const [first, second] = await Promise.all([
      customers.resolveForStaff({ phone: '+996700111668', name: 'First Intake' }),
      customers.resolveForStaff({ phone: '996700111668', name: 'Second Intake' }),
    ]);
    expect(first.id).toBe(second.id);
    expect(await prisma.customer.count({ where: { phone: { in: ['+996700111668', '996700111668'] } } })).toBe(1);
  });

  it('defaults the name when none is given', async () => {
    const c = await customers.upsert({ phone: '+996555000111' });
    expect(c.name).toBe('Клиент');
  });

  it('toggles marketing consent and logs customer.consent_changed only on a real flip', async () => {
    const c = await customers.upsert({ phone: '+996700333444' });
    expect(c.consent).toBe(false);

    const on = await customers.setConsent(c.id, true, 'customer');
    expect(on.consent).toBe(true);

    // idempotent: setting the same value again writes no new event
    await customers.setConsent(c.id, true, 'customer');
    const off = await customers.setConsent(c.id, false, 'agent');
    expect(off.consent).toBe(false);

    const consentEvents = await prisma.auditEvent.findMany({ where: { type: 'customer.consent_changed' } });
    expect(consentEvents).toHaveLength(2); // false→true, true→false (the no-op flip logged nothing)
  });
});
