import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { CustomersService } from '../src/customers/customers.service';

/** Guest-checkout customers: find-or-create is idempotent by phone. */
describe('Customers find-or-create (integration)', () => {
  let prisma: PrismaService;
  let customers: CustomersService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    customers = new CustomersService(prisma, new AuditService(prisma));
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
    const first = await customers.upsert({ phone: '+996700111222', name: 'Айбек' });
    const again = await customers.upsert({ phone: '+996700111222', name: 'Айбек Т.' });

    expect(again.id).toBe(first.id);
    expect(again.name).toBe('Айбек Т.'); // name updated when provided

    const count = await prisma.customer.count({ where: { phone: '+996700111222' } });
    expect(count).toBe(1);
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
