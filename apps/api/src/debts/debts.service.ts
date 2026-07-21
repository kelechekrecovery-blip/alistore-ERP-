import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { ApprovalsService } from '../approvals/approvals.service';
import { OutboxService } from '../outbox/outbox.service';
import { SettingsService } from '../settings/settings.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { insertDebt } from './debt-insert';
import { CreateDebtDto, DebtPaymentDto } from './debts.dto';
import { paymentAccountCode, postAccountingEntryOnTx } from '../finance/accounting-journal';

/** Debt above this (сом) requires approval (Approval Rules Matrix, action=debt). */
export const DEBT_LIMIT = 50_000;
const DEFAULT_TERM_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REMINDER_DAYS = 3;
const DEFAULT_REMINDER_LIMIT = 100;

type DebtReminderKind = 'debt_due_soon' | 'debt_overdue';

/**
 * Sale on credit / installments. A debt within the limit is booked directly; a debt
 * over the limit is parked for approval (202) and only booked when approved. Payments
 * reduce the balance until settled; overdue open debts surface in the Risk Center.
 */
@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly outbox: OutboxService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Наличные принимает только сотрудник с открытой сменой в своей точке — тот
   * же контракт, что в `payments.service.ts`. Без него деньги попадали в ящик,
   * о котором система не знала.
   */
  private async resolveCashShiftOnTx(tx: Prisma.TransactionClient, actor: string) {
    const candidate = await tx.cashShift.findFirst({
      where: { staffId: actor, closedAt: null },
      select: { id: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!candidate) {
      throw new ConflictError('cash_shift_required', 'Для наличного погашения нужна открытая кассовая смена');
    }
    await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${candidate.id} FOR UPDATE`;
    const shift = await tx.cashShift.findUnique({ where: { id: candidate.id } });
    if (!shift || shift.closedAt) {
      throw new ConflictError('cash_shift_closed', 'Нельзя добавить погашение в закрытую кассовую смену');
    }
    return shift;
  }

  get(id: string) {
    return this.prisma.debtPlan.findUnique({ where: { id } });
  }

  list(filter: { customerId?: string; status?: string }) {
    return this.prisma.debtPlan.findMany({
      where: {
        ...(filter.customerId ? { customerId: filter.customerId } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
      },
      orderBy: { dueDate: 'asc' },
      take: 100,
    });
  }

  /** Book a debt, or park it for approval when it exceeds the limit. */
  async create(dto: CreateDebtDto, actor: string) {
    const idempotencyKey = dto.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const replay = await this.prisma.debtPlan.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.orderId === dto.orderId
          && replay.principal === dto.principal
          && replay.installments === (dto.installments ?? 1)) return replay;
        throw new ConflictError('debt_idempotency_conflict', 'Ключ создания долга уже использован с другими параметрами');
      }
    }
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { payments: { select: { amount: true, status: true } } },
    });
    if (!order) {
      throw new ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
    }
    const dueDate = new Date(Date.now() + (dto.termDays ?? DEFAULT_TERM_DAYS) * DAY_MS);
    const input = {
      orderId: dto.orderId,
      customerId: order.customerId,
      principal: dto.principal,
      installments: dto.installments ?? 1,
      dueDate,
      idempotencyKey,
    };

    const received = order.payments
      .filter((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status))
      .reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = Math.max(0, order.total - received);
    if (dto.principal > outstanding) {
      throw new ValidationError('debt_principal_exceeds_outstanding', `Непокрытый остаток заказа: ${outstanding}`);
    }
    const existing = await this.prisma.debtPlan.findUnique({ where: { orderId: dto.orderId } });
    if (existing) throw new ConflictError('order_debt_exists', 'Для заказа уже оформлен долг или рассрочка');

    // Лимит был константой рядом с кодом, а панель владельца писала значение в
    // таблицу и событие в леджер — рычаг подтверждал срабатывание и ничего не
    // менял. Дефолт остался в реестре, поэтому поведение прежнее, пока владелец
    // ничего не трогал.
    const debtLimit = await this.settings.value('credit.debt_limit_som');
    if (dto.principal > debtLimit) {
      return this.approvals.request({
        action: 'debt',
        requester: actor,
        reason: dto.reason ?? `Долг ${dto.principal} сом (> лимита ${debtLimit})`,
        payload: { ...input, dueDate: dueDate.toISOString() },
      });
    }

    return this.audit.transaction(async (tx) => {
      const events: AuditInput[] = [];
      const debt = await insertDebt(tx, input, actor, events);
      return { result: debt, events };
    });
  }

  /** Record a payment against a debt; settles it when the balance reaches zero. */
  async pay(id: string, dto: DebtPaymentDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const commandKey = dto.idempotencyKey?.trim() || null;
      if (commandKey) {
        const replay = await tx.payment.findUnique({ where: { idempotencyKey: `debt:${commandKey}` } });
        if (replay) {
          if (replay.orderId === null || replay.amount !== dto.amount) throw new ConflictError('debt_payment_idempotency_conflict', 'Ключ погашения уже использован с другой суммой');
          const replayDebt = await tx.debtPlan.findUniqueOrThrow({ where: { id } });
          if (replayDebt.orderId !== replay.orderId) throw new ConflictError('debt_payment_idempotency_conflict', 'Ключ погашения принадлежит другому долгу');
          return { result: { debt: replayDebt, paymentId: replay.id, settled: replayDebt.status === 'settled', idempotent: true }, events: [] };
        }
      }
      const debt = await tx.debtPlan.findUnique({ where: { id } });
      if (!debt) {
        throw new ValidationError('debt_not_found', `Долг ${id} не найден`);
      }
      if (debt.status !== 'open') {
        throw new ConflictError('debt_not_open', `Долг ${id} уже ${debt.status}`);
      }
      if (dto.amount <= 0 || dto.amount > debt.balance) {
        throw new ValidationError(
          'invalid_debt_payment',
          `Сумма должна быть в пределах остатка (${debt.balance})`,
        );
      }
      // Atomic conditional decrement — guards against the lost-update race when two
      // payments for the same debt run concurrently (mirror giftcards.redeemOnTx).
      const dec = await tx.debtPlan.updateMany({
        where: { id, status: 'open', balance: { gte: dto.amount } },
        data: { balance: { decrement: dto.amount } },
      });
      if (dec.count === 0) {
        throw new ConflictError('debt_payment_conflict', `Долг ${id} изменился — повторите`);
      }
      const decremented = await tx.debtPlan.findUniqueOrThrow({ where: { id } });
      const balance = decremented.balance;
      const settled = balance === 0;
      const updated = settled
        ? await tx.debtPlan.update({ where: { id }, data: { status: 'settled' } })
        : decremented;
      // Платёж создавался с method: 'installment' и захардкоженным счётом 1000
      // «Наличные в кассе», но без shiftId и без point. ShiftsService.expectedCash
      // считает по { shiftId, method: 'cash' }, поэтому наличное погашение в
      // ожидаемый остаток не попадало никогда: вечером в ящике оказывался
      // излишек ровно на сумму всех погашений за смену. Погашение картой при
      // этом тоже ложилось на счёт наличных.
      const method = dto.method ?? 'cash';
      const cashShift = method === 'cash'
        ? await this.resolveCashShiftOnTx(tx, actor)
        : null;
      const payment = await tx.payment.create({
        data: {
          orderId: debt.orderId,
          amount: dto.amount,
          method,
          status: 'received',
          accountCode: paymentAccountCode(method),
          shiftId: cashShift?.id ?? null,
          point: cashShift?.point ?? null,
          idempotencyKey: commandKey ? `debt:${commandKey}` : undefined,
          receivedBy: actor,
        },
      });
      const accountingEntry = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:debt.payment:${payment.id}`,
        sourceType: 'debt.payment',
        sourceRef: payment.id,
        description: `Погашение долга ${id}`,
        occurredAt: payment.createdAt,
        createdBy: actor,
        lines: [
          { accountCode: paymentAccountCode(method), debit: dto.amount, memo: 'Получение платежа по рассрочке' },
          { accountCode: '1100', credit: dto.amount, memo: 'Уменьшение дебиторской задолженности' },
        ],
      });
      await tx.payment.update({ where: { id: payment.id }, data: { accountingEntryId: accountingEntry.id } });
      const events: AuditInput[] = [
        {
          type: EventType.DebtPaid,
          actor,
          payload: { debtId: id, amount: dto.amount, balance, paymentId: payment.id },
          refs: [id, debt.orderId, payment.id],
        },
      ];
      events.push({
        type: EventType.AccountingEntryPosted,
        actor,
        payload: { accountingEntryId: accountingEntry.id, sourceType: 'debt.payment', sourceRef: payment.id, debtId: id, amount: dto.amount },
        refs: [accountingEntry.id, payment.id, id],
      });
      if (settled) {
        events.push({
          type: EventType.DebtSettled,
          actor,
          payload: { debtId: id, orderId: debt.orderId, principal: debt.principal },
          refs: [id, debt.orderId, debt.customerId],
        });
      }
      return { result: { debt: updated, paymentId: payment.id, settled, idempotent: false }, events };
    });
  }

  /**
   * Queue debt reminders through the transactional outbox. Idempotent per
   * debt+kind, so the sweep can run repeatedly; a due-soon reminder does not
   * block a later overdue reminder after the due date passes.
   */
  async enqueueReminders(options?: { now?: Date; dueSoonDays?: number; limit?: number }, actor = 'system') {
    const now = options?.now ?? new Date();
    const dueSoonDays = options?.dueSoonDays ?? DEFAULT_REMINDER_DAYS;
    const limit = options?.limit ?? DEFAULT_REMINDER_LIMIT;
    const dueSoonUntil = new Date(now.getTime() + dueSoonDays * DAY_MS);

    return this.audit.transaction(async (tx) => {
      const debts = await tx.debtPlan.findMany({
        where: {
          status: 'open',
          dueDate: { lte: dueSoonUntil },
        },
        orderBy: { dueDate: 'asc' },
        take: limit,
      });
      const events: AuditInput[] = [];
      let queued = 0;

      for (const debt of debts) {
        const kind: DebtReminderKind = debt.dueDate.getTime() <= now.getTime() ? 'debt_overdue' : 'debt_due_soon';
        const alreadyQueued = await tx.auditEvent.findFirst({
          where: {
            type: EventType.DebtReminderQueued,
            refs: { hasEvery: [debt.id, kind] },
          },
        });
        if (alreadyQueued) continue;

        const daysUntilDue = Math.ceil((debt.dueDate.getTime() - now.getTime()) / DAY_MS);
        const queuedNotice = await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: debt.customerId,
          template: kind,
          payload: {
            debtId: debt.id,
            orderId: debt.orderId,
            customerId: debt.customerId,
            balance: debt.balance,
            dueDate: debt.dueDate.toISOString(),
            daysUntilDue,
          },
        });
        if (!queuedNotice) continue;
        events.push({
          type: EventType.DebtReminderQueued,
          actor,
          payload: {
            debtId: debt.id,
            orderId: debt.orderId,
            customerId: debt.customerId,
            kind,
            balance: debt.balance,
            dueDate: debt.dueDate.toISOString(),
            daysUntilDue,
          },
          refs: [debt.id, debt.orderId, debt.customerId, kind],
        });
        queued += 1;
      }

      return { result: { considered: debts.length, queued }, events };
    });
  }
}
