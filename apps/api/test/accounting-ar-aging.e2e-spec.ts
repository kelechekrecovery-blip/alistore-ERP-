import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DebtPlan } from '@prisma/client';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { DebtsModule } from '../src/debts/debts.module';
import { DebtsService } from '../src/debts/debts.service';
import { FinanceModule } from '../src/finance/finance.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Finance AR aging and primary-document drilldown', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let debts: DebtsService;
  let ownerToken: string;
  let sellerToken: string;
  let sellerId: string;
  const run = Math.floor(Math.random() * 1_000_000);
  let sequence = 0;
  const ownedDebtIds = new Set<string>();
  const ownedOrderIds = new Set<string>();
  const ownedCustomerIds = new Set<string>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, DebtsModule, FinanceModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    debts = moduleRef.get(DebtsService);
    const staffAuth = moduleRef.get(StaffAuthService);

    const owner = await staffAuth.createStaff(`owner-ar-${run}`, 'pass', 'owner');
    ownerToken = (await staffAuth.login(`owner-ar-${run}`, 'pass')).accessToken;
    const seller = await staffAuth.createStaff(`seller-ar-${run}`, 'pass', 'seller');
    sellerId = seller.id;
    sellerToken = (await staffAuth.login(`seller-ar-${run}`, 'pass')).accessToken;
  });

  async function clean() {
    const staleDebts = await prisma.debtPlan.findMany({ where: { idempotencyKey: { startsWith: 'ar-' } }, select: { id: true } });
    const staleOrders = await prisma.order.findMany({ where: { channel: 'ar-test' }, select: { id: true } });
    const staleCustomers = await prisma.customer.findMany({ where: { phone: { startsWith: '+996799' } }, select: { id: true } });
    const debtIds = [...new Set([...ownedDebtIds, ...staleDebts.map((debt) => debt.id)])];
    const orderIds = [...new Set([...ownedOrderIds, ...staleOrders.map((order) => order.id)])];
    const customerIds = [...new Set([...ownedCustomerIds, ...staleCustomers.map((customer) => customer.id)])];
    await prisma.payment.deleteMany({ where: { idempotencyKey: { startsWith: 'ar-' } } });
    if (debtIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.debtPlan.updateMany({ where: { id: { in: debtIds } }, data: { accountingEntryId: null } });
        await tx.accountingJournalLine.deleteMany({ where: { entry: { sourceType: 'debt.origination', sourceRef: { in: debtIds } } } });
        await tx.accountingJournalEntry.deleteMany({ where: { sourceType: 'debt.origination', sourceRef: { in: debtIds } } });
        await tx.debtPlan.deleteMany({ where: { id: { in: debtIds } } });
        await tx.auditEvent.deleteMany({ where: { refs: { hasSome: debtIds } } });
      });
    }
    if (orderIds.length > 0) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    if (customerIds.length > 0) await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    ownedDebtIds.clear();
    ownedOrderIds.clear();
    ownedCustomerIds.clear();
  }

  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await app.close();
  });

  async function fixture(principal: number, name: string) {
    sequence += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+996799${run}${sequence}`, name, consent: true },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'ar-test', total: principal, status: 'paid' },
    });
    const debt = await debts.create({
      orderId: order.id,
      principal,
      installments: 2,
      idempotencyKey: `ar-${run}-${sequence}`,
    }, sellerId) as DebtPlan;
    ownedCustomerIds.add(customer.id);
    ownedOrderIds.add(order.id);
    ownedDebtIds.add(debt.id);
    return { customer, order, debt };
  }

  it('returns an as-of AR snapshot, filters by customer/status, and exposes the source documents', async () => {
    const first = await fixture(10_000, 'AR overdue');
    const second = await fixture(12_000, 'AR settled');
    const asOf = new Date('2026-07-18T12:00:00.000Z');

    await prisma.debtPlan.update({
      where: { id: first.debt.id },
      data: { createdAt: new Date('2026-07-01T10:00:00.000Z'), dueDate: new Date('2026-06-01T10:00:00.000Z'), balance: 6_000 },
    });
    await prisma.debtPlan.update({
      where: { id: second.debt.id },
      data: { createdAt: new Date('2026-07-01T10:00:00.000Z'), dueDate: new Date('2026-06-01T10:00:00.000Z'), balance: 0, status: 'settled' },
    });
    await prisma.payment.create({
      data: {
        orderId: first.order.id,
        amount: 4_000,
        method: 'installment',
        status: 'received',
        idempotencyKey: `ar-${run}-future-payment`,
        createdAt: new Date('2026-07-20T10:00:00.000Z'),
      },
    });
    await prisma.payment.create({
      data: {
        orderId: second.order.id,
        amount: 12_000,
        method: 'installment',
        status: 'received',
        idempotencyKey: `ar-${run}-settled-payment`,
        createdAt: new Date('2026-07-10T10:00:00.000Z'),
      },
    });

    const report = await request(app.getHttpServer())
      .get(`/finance/ar-aging?asOf=${encodeURIComponent(asOf.toISOString())}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(report.body).toMatchObject({
      totalPrincipal: 22_000,
      totalPaid: 12_000,
      totalOutstanding: 10_000,
      customerCount: 2,
      totals: { '31_60': 10_000, paid: 0 },
    });
    expect(report.body.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.debt.id, balance: 10_000, paidAmount: 0, bucket: '31_60', status: 'open', payments: [] }),
      expect.objectContaining({ id: second.debt.id, balance: 0, paidAmount: 12_000, bucket: 'paid', status: 'settled' }),
    ]));

    const later = await request(app.getHttpServer())
      .get('/finance/ar-aging?asOf=2026-07-25T12:00:00.000Z&status=open')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(later.body.rows).toHaveLength(1);
    expect(later.body.rows[0]).toMatchObject({ id: first.debt.id, balance: 6_000, paidAmount: 4_000, payments: [expect.objectContaining({ amount: 4_000 })] });

    const filtered = await request(app.getHttpServer())
      .get(`/finance/ar-aging?asOf=${encodeURIComponent(asOf.toISOString())}&customerId=${first.customer.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(filtered.body.rows).toHaveLength(1);
    expect(filtered.body.rows[0].customer).toEqual({ id: first.customer.id, name: first.customer.name });

    const document = await request(app.getHttpServer())
      .get(`/finance/ar-aging/${first.debt.id}?asOf=${encodeURIComponent(asOf.toISOString())}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(document.body).toMatchObject({ id: first.debt.id, order: { id: first.order.id }, accountingEntry: { sourceType: 'debt.origination', sourceRef: first.debt.id } });
    expect(document.body.accountingEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1100', debit: 10_000, credit: 0 }),
    ]));
  });

  it('keeps AR read access behind finance RBAC', async () => {
    await request(app.getHttpServer())
      .get('/finance/ar-aging')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
  });
});
