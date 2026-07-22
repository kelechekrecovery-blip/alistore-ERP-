import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ValidationError } from '../src/common/errors';

/**
 * `price` executor (action-executors.ts) applies `newPrice` from the parked
 * approval payload with no validation — unlike `manual_adjustment`, which
 * re-validates its snapshot before writing anything (invariant: parked
 * payloads are untrusted at execution time, not just at request time).
 *
 * The request-side DTO (`ChangePriceDto`) already blocks a negative price
 * with `@IsInt() @Min(0)`, so a negative `newPrice` can only reach the
 * executor via a parked Approval row that bypassed the DTO (a malformed
 * snapshot — e.g. written directly, or from a future caller that forgets the
 * DTO). This test seeds that snapshot directly at the Approval row level to
 * exercise the executor's own defensive re-validation.
 */
describe('Approvals · price executor re-validates its parked snapshot', () => {
  let prisma: PrismaService;
  let approvals: ApprovalsService;
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    approvals = new ApprovalsService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { requester: { startsWith: `price-snapshot-${run}` } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: `PRICE-SNAP-${run}` } } });
    await prisma.$disconnect();
  });

  async function product() {
    return prisma.product.create({
      data: {
        sku: `PRICE-SNAP-${run}-${Math.random()}`,
        name: 'Snapshot phone',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
  }

  it('rejects a negative newPrice snapshot and leaves the product price untouched', async () => {
    const p = await product();
    const requester = `price-snapshot-${run}-requester`;
    const approval = await prisma.approval.create({
      data: {
        action: 'price',
        requester,
        reason: 'malformed snapshot (should never happen via the DTO)',
        status: 'requested',
        evidence: { payload: { productId: p.id, newPrice: -100 }, evidence: null },
      },
    });

    const err = await approvals
      .decide(approval.id, { status: 'approved', approver: `price-snapshot-${run}-approver`, approverRole: 'admin' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('price_snapshot_invalid');

    // The whole approval transaction rolled back — the price must still be
    // the original value (never negative), and the approval must still be
    // pending, not silently marked approved.
    await expect(prisma.product.findUniqueOrThrow({ where: { id: p.id } }))
      .resolves.toMatchObject({ price: 100000 });
    await expect(prisma.approval.findUniqueOrThrow({ where: { id: approval.id } }))
      .resolves.toMatchObject({ status: 'requested' });
  });
});
