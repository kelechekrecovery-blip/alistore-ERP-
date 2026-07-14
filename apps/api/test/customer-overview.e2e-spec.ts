import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { CustomersService } from '../src/customers/customers.service';
import { ValidationError } from '../src/common/errors';

/**
 * Customer 360 (Phase 10): one read folds a customer's orders, spend, debts,
 * warranties and support tickets. Spend is derived from received payments, never
 * a stored aggregate.
 */
describe('Customer 360 (integration)', () => {
  let prisma: PrismaService;
  let customers: CustomersService;
  let seq = 0;
  const ownedCustomerIds = new Set<string>();
  const phoneSeed = Math.floor(Math.random() * 10_000).toString().padStart(4, '0');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    customers = new CustomersService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    const customerIds = [...ownedCustomerIds];
    if (customerIds.length > 0) {
      const orderIds = (
        await prisma.order.findMany({
          where: { customerId: { in: customerIds } },
          select: { id: true },
        })
      ).map((order) => order.id);
      await prisma.supportTicket.deleteMany({ where: { customerId: { in: customerIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.debtPlan.deleteMany({ where: { customerId: { in: customerIds } } });
      await prisma.warrantyCase.deleteMany({ where: { customerId: { in: customerIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    }
    await prisma.$disconnect();
  });

  it('aggregates orders, spend, debts, warranties and tickets', async () => {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+99671${phoneSeed}${seq.toString().padStart(2, '0')}`, name: 'C360', consent: true },
    });
    ownedCustomerIds.add(customer.id);
    const o1 = await prisma.order.create({ data: { customerId: customer.id, channel: 'pos', total: 40000, status: 'completed' } });
    const o2 = await prisma.order.create({ data: { customerId: customer.id, channel: 'web', total: 15000, status: 'paid' } });
    await prisma.payment.createMany({
      data: [
        { orderId: o1.id, amount: 40000, method: 'cash', status: 'received' },
        { orderId: o2.id, amount: 15000, method: 'card', status: 'received' },
        { orderId: o2.id, amount: -5000, method: 'card', status: 'refunded' }, // refund excluded from spend
      ],
    });
    await prisma.debtPlan.create({
      data: { orderId: o1.id, customerId: customer.id, principal: 20000, balance: 12000, installments: 2, dueDate: new Date(), status: 'open' },
    });
    await prisma.warrantyCase.create({
      data: { imei: `C360-${seq}`, customerId: customer.id, problem: 'x', status: 'diagnostics', sla: new Date() },
    });
    await prisma.supportTicket.create({
      data: { customerId: customer.id, channel: 'app', subject: 'q', priority: 'normal', sla: new Date(), status: 'in_progress' },
    });

    const ov = await customers.overview(customer.id);

    expect(ov.customer).toMatchObject({ id: customer.id, name: 'C360', consent: true });
    expect(ov.orders.total).toBe(2);
    expect(ov.orders.spent).toBe(55000); // 40000 + 15000, refund excluded
    expect(ov.debts).toMatchObject({ count: 1, openBalance: 12000 });
    expect(ov.warranties.open).toBe(1);
    expect(ov.tickets.open).toBe(1);
  });

  it('returns empty aggregates for a customer with no activity', async () => {
    seq += 1;
    const customer = await prisma.customer.create({ data: { phone: `+99672${phoneSeed}${seq.toString().padStart(2, '0')}`, name: 'Empty' } });
    ownedCustomerIds.add(customer.id);
    const ov = await customers.overview(customer.id);
    expect(ov.orders).toMatchObject({ total: 0, spent: 0 });
    expect(ov.debts.openBalance).toBe(0);
    expect(ov.warranties.open).toBe(0);
    expect(ov.tickets.open).toBe(0);
  });

  it('throws for an unknown customer', async () => {
    const err = await customers.overview('nope').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('customer_not_found');
  });
});
