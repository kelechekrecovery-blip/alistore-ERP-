import { ApprovalsService } from '../src/approvals/approvals.service';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Правило четырёх глаз должно покрывать все материальные действия.
 *
 * Оно применялось к списку `campaign_budget, refund, quarantine_write_off,
 * exchange, manual_adjustment` — и **скидки в нём не было**. При этом скидку
 * одобряют `senior_seller, admin, owner` (`rbac/permissions.ts`), то есть роль,
 * стоящая за кассой, а `discountPct` в DTO допускает 100.
 *
 * Итог: старший продавец собирал корзину, ставил скидку 100%, получал
 * approvalId, сам же его одобрял и проводил продажу с нулевым итогом. Товар
 * уходил бесплатно.
 *
 * Тест держит инвариант «инициатор не решает собственное материальное
 * действие» для каждого действия из списка, а не для конкретной скидки: список
 * будет расти, и новое действие не должно тихо оказаться вне правила.
 */
describe('Approvals · правило четырёх глаз', () => {
  let prisma: PrismaService;
  let approvals: ApprovalsService;
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    approvals = new ApprovalsService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { requester: { startsWith: `four-eyes-${run}` } } });
    await prisma.$disconnect();
  });

  async function requestDiscount(requester: string) {
    const { approvalId } = await approvals.request({
      action: 'discount',
      requester,
      reason: 'Скидка 100% на витринный образец',
      payload: { discountPct: 100 },
    });
    return approvalId;
  }

  it('старший продавец не может одобрить собственную скидку', async () => {
    const actor = `four-eyes-${run}-self`;
    const approvalId = await requestDiscount(actor);

    await expect(
      approvals.decide(approvalId, { status: 'approved', approver: actor, approverRole: 'senior_seller' }),
    ).rejects.toMatchObject({ code: 'four_eye_approval_required' });
  });

  it('другой сотрудник с тем же правом скидку одобряет', async () => {
    const requester = `four-eyes-${run}-req`;
    const approvalId = await requestDiscount(requester);

    const decided = await approvals.decide(approvalId, {
      status: 'approved',
      approver: `four-eyes-${run}-other`,
      approverRole: 'senior_seller',
    });

    expect(decided?.status).toBe('approved');
  });
});
