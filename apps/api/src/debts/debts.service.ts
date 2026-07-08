import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { ApprovalsService } from '../approvals/approvals.service';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { insertDebt } from './debt-insert';
import { CreateDebtDto, DebtPaymentDto } from './debts.dto';

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
  ) {}

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
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
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
    };

    if (dto.principal > DEBT_LIMIT) {
      return this.approvals.request({
        action: 'debt',
        requester: actor,
        reason: dto.reason ?? `Долг ${dto.principal} сом (> лимита ${DEBT_LIMIT})`,
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
      const balance = debt.balance - dto.amount;
      const settled = balance === 0;
      const updated = await tx.debtPlan.update({
        where: { id },
        data: { balance, status: settled ? 'settled' : 'open' },
      });
      const payment = await tx.payment.create({
        data: { orderId: debt.orderId, amount: dto.amount, method: 'installment', status: 'received' },
      });
      const events: AuditInput[] = [
        {
          type: EventType.DebtPaid,
          actor,
          payload: { debtId: id, amount: dto.amount, balance, paymentId: payment.id },
          refs: [id, debt.orderId, payment.id],
        },
      ];
      if (settled) {
        events.push({
          type: EventType.DebtSettled,
          actor,
          payload: { debtId: id, orderId: debt.orderId, principal: debt.principal },
          refs: [id, debt.orderId, debt.customerId],
        });
      }
      return { result: { debt: updated, paymentId: payment.id, settled }, events };
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
