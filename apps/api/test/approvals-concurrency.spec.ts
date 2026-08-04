import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ConflictError } from '../src/common/errors';

/**
 * P0: an approval must be decided exactly once. Two concurrent decides used to
 * both pass the `status === 'requested'` check and each execute the parked action
 * (double refund / double price change). The conditional updateMany now claims
 * the transition atomically.
 */
describe('Concurrency: an approval is decided only once (P0)', () => {
  let prisma: PrismaService;
  let approvals: ApprovalsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    approvals = new ApprovalsService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('two parallel decisions on one approval → exactly one wins', async () => {
    const approval = await prisma.approval.create({
      data: {
        action: 'refund',
        requester: 'seller-1',
        status: 'requested',
        reason: 'возврат',
      },
    });

    const decide = () =>
      approvals.decide(approval.id, {
        status: 'rejected',
        approver: 'admin-1',
        approverRole: 'admin',
        reason: 'нет',
      });

    const results = await Promise.allSettled([decide(), decide()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1); // exactly one decider wins
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictError,
    );

    const final = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(final?.status).toBe('rejected');
  });
});
