import { FinanceService } from './finance.service';

describe('FinanceService accounting period refund readiness', () => {
  it('excludes rejected operator-cancelled refunds even when allocations remain failed', async () => {
    const { service, refundCount } = readinessService();

    const result = await service.accountingPeriodReadiness('2026-07');

    expect(result.ready).toBe(true);
    expect(refundCount).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lt: new Date('2026-08-01T00:00:00.000Z'),
        },
        status: { not: 'rejected' },
        OR: [
          { status: { in: ['requested', 'approved', 'processing', 'partially_succeeded'] } },
          { allocations: { some: { status: { not: 'succeeded' } } } },
        ],
      },
    });
  });

  it('keeps pending and provider-ambiguous refunds in the close blocker projection', async () => {
    const { service, refundCount } = readinessService(2);

    const result = await service.accountingPeriodReadiness('2026-07');

    expect(result.ready).toBe(false);
    expect(result.counts.openRefunds).toBe(2);
    expect(result.blockers).toContainEqual({
      code: 'refund_execution_open',
      message: 'В периоде остались незавершённые возвраты: 2',
    });
    const where = refundCount.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: 'rejected' });
    expect(where.OR).toEqual(expect.arrayContaining([
      { status: { in: expect.arrayContaining(['requested', 'approved', 'processing', 'partially_succeeded']) } },
      { allocations: { some: { status: { not: 'succeeded' } } } },
    ]));
  });
});

function readinessService(openRefunds = 0) {
  const refundCount = jest.fn().mockResolvedValue(openRefunds);
  const zeroCount = jest.fn().mockResolvedValue(0);
  const tx = {
    financeSettlementRun: { count: zeroCount },
    cashShift: { count: zeroCount },
    refund: { count: refundCount },
    supplierInvoice: { count: zeroCount },
    bankStatement: { count: zeroCount },
    hrPayrollRun: { count: zeroCount },
    accountableAdvance: { count: zeroCount },
    expense: { count: zeroCount },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return {
    service: new FinanceService(prisma as never, {} as never),
    refundCount,
  };
}
