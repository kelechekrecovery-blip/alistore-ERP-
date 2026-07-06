import { PrismaService } from '../src/prisma/prisma.service';
import { CustomersService } from '../src/customers/customers.service';

/** Guest-checkout customers: find-or-create is idempotent by phone. */
describe('Customers find-or-create (integration)', () => {
  let prisma: PrismaService;
  let customers: CustomersService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    customers = new CustomersService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
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
});
