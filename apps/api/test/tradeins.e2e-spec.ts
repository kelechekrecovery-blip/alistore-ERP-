import { AuditService } from '../src/audit/audit.service';
import { ValidationError } from '../src/common/errors';
import { PrismaService } from '../src/prisma/prisma.service';
import { TradeInsService } from '../src/tradeins/tradeins.service';

describe('Trade-ins (integration)', () => {
  let prisma: PrismaService;
  let tradeIns: TradeInsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    tradeIns = new TradeInsService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.debtPlan.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function customer() {
    seq += 1;
    return prisma.customer.create({
      data: { phone: `+9967099${seq.toString().padStart(4, '0')}`, name: 'Trade Seller' },
    });
  }

  it('creates a trade-in contract, masks passport in response, and writes ledger events', async () => {
    const seller = await customer();

    const tradeIn = await tradeIns.create({
      customerId: seller.id,
      model: 'iPhone 13 Pro 256GB',
      grade: 'B',
      price: 42000,
      sellerPassport: 'ID1234567',
      actor: 'seller_azamat',
    });

    expect(tradeIn.contractId).toMatch(/^TI-\d{8}-[A-F0-9]{6}$/);
    expect(tradeIn.sellerPassportMasked).toBe('ID1***67');
    expect(tradeIn).not.toHaveProperty('sellerPassport');

    const stored = await prisma.tradeInDevice.findUnique({ where: { id: tradeIn.id } });
    expect(stored?.sellerPassport).toBe('ID1234567');
    expect(stored?.contractId).toBe(tradeIn.contractId);

    const events = await prisma.auditEvent.findMany({ orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual([
      'tradein.assessed',
      'tradein.contracted',
    ]);
    expect(events[0].refs).toEqual(expect.arrayContaining([tradeIn.id, seller.id]));
  });

  it('rejects a trade-in for an unknown customer', async () => {
    const err = await tradeIns
      .create({
        customerId: 'missing',
        model: 'iPhone 11',
        grade: 'C',
        price: 15000,
        sellerPassport: 'ID7654321',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('customer_not_found');
    expect(await prisma.tradeInDevice.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
});
