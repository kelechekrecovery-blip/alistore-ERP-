import { ApprovalsService, FOUR_EYES_ACTIONS, SINGLE_APPROVER_ACTIONS } from '../src/approvals/approvals.service';
import { APPROVAL_APPROVER_ROLES } from '../src/rbac/permissions';
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

  /**
   * Список обязан покрывать каждое согласуемое действие системы.
   *
   * У этой проверки было две версии, и первые две ошиблись одинаково — считали
   * список полным, не сверяясь с реестром.
   *
   * Версия 1: список содержал `price_change` — строку, которую не производит ни
   * одна строка кода (реальное действие называется `price`). Правило для цен не
   * срабатывало, дыра выглядела закрытой.
   *
   * Версия 2 вычитывала литералы `action: '...'` из вызовов `approvals.request`
   * в исходниках. Она поймала бы опечатку, но не увидела `write_off` и
   * `stock_adjust`: там действие вычисляемое — `ACTION_BY_TYPE[dto.type]`
   * (`inventory.service.ts`). Именно этими двумя выносят склад.
   *
   * Теперь источник — `APPROVAL_APPROVER_ROLES`: реестр, без записи в котором
   * действие вообще нельзя согласовать (`canApprove`). Обойти его нечем.
   */
  it('каждое согласуемое действие классифицировано явно', () => {
    const classified = new Set([...FOUR_EYES_ACTIONS, ...SINGLE_APPROVER_ACTIONS]);
    const unclassified = Object.keys(APPROVAL_APPROVER_ROLES)
      .filter((action) => !classified.has(action))
      .sort();
    expect(unclassified).toEqual([]);
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
