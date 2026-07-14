import { Injectable } from '@nestjs/common';
import { ExpenseStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto, EXPENSE_CATEGORIES, SetFinanceBudgetDto } from './finance.dto';

const EXPENSE_INCLUDE = {
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(status?: string) {
    const allowed: ExpenseStatus[] = ['submitted', 'approved', 'rejected', 'paid'];
    if (status && !allowed.includes(status as ExpenseStatus)) {
      throw new ValidationError('invalid_expense_status', `Неизвестный статус расхода: ${status}`);
    }
    return this.prisma.expense.findMany({
      where: status ? { status: status as ExpenseStatus } : undefined,
      include: EXPENSE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  listBudgets(period: string, point?: string) {
    return this.prisma.financeBudget.findMany({
      where: { period, point: normalizePoint(point) },
      orderBy: { category: 'asc' },
    }).then((budgets) => budgets.map(publicBudget));
  }

  async setBudget(dto: SetFinanceBudgetDto, actor: string) {
    const input = {
      period: dto.period,
      category: dto.category,
      point: normalizePoint(dto.point),
      amount: dto.amount,
    };
    try {
      return await this.audit.transaction(async (tx) => {
        const lockKey = `finance-budget:${input.period}:${input.category}:${input.point}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const command = await tx.financeBudgetCommand.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (command) return { result: replayBudgetCommand(command, input), events: [] };

        const existing = await tx.financeBudget.findUnique({
          where: { period_category_point: { period: input.period, category: input.category, point: input.point } },
        });
        const budget = existing
          ? await tx.financeBudget.update({
              where: { id: existing.id },
              data: { amount: input.amount, updatedBy: actor, version: { increment: 1 } },
            })
          : await tx.financeBudget.create({ data: { ...input, createdBy: actor, updatedBy: actor } });
        const response = { ...publicBudget(budget), idempotent: false };
        await tx.financeBudgetCommand.create({
          data: {
            idempotencyKey: dto.idempotencyKey,
            ...input,
            budgetId: budget.id,
            response,
          },
        });
        return {
          result: response,
          events: [{
            type: EventType.FinanceBudgetSet,
            actor,
            payload: {
              budgetId: budget.id,
              period: input.period,
              category: input.category,
              point: input.point || null,
              amount: input.amount,
              previousAmount: existing?.amount ?? null,
              version: budget.version,
            },
            refs: [budget.id],
          }],
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const command = await this.prisma.financeBudgetCommand.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (command) return replayBudgetCommand(command, input);
      }
      throw error;
    }
  }

  async planFact(period: string, point?: string) {
    const normalizedPoint = normalizePoint(point);
    const [start, end] = periodBounds(period);
    const [budgets, actuals] = await Promise.all([
      this.prisma.financeBudget.findMany({ where: { period, point: normalizedPoint } }),
      this.prisma.expense.groupBy({
        by: ['category'],
        where: {
          status: 'paid',
          incurredAt: { gte: start, lt: end },
          ...(normalizedPoint ? { point: normalizedPoint } : {}),
        },
        _sum: { amount: true },
      }),
    ]);
    const budgetByCategory = new Map(budgets.map((budget) => [budget.category, budget.amount]));
    const actualByCategory = new Map(actuals.map((actual) => [actual.category, actual._sum.amount ?? 0]));
    const rows = EXPENSE_CATEGORIES.map((category) => {
      const plan = budgetByCategory.get(category) ?? 0;
      const actual = actualByCategory.get(category) ?? 0;
      return {
        category,
        plan,
        actual,
        variance: plan - actual,
        usagePct: plan > 0 ? Math.round((actual / plan) * 1000) / 10 : null,
      };
    });
    const plan = rows.reduce((sum, row) => sum + row.plan, 0);
    const actual = rows.reduce((sum, row) => sum + row.actual, 0);
    return {
      period,
      point: normalizedPoint || null,
      plan,
      actual,
      variance: plan - actual,
      usagePct: plan > 0 ? Math.round((actual / plan) * 1000) / 10 : null,
      rows,
    };
  }

  async create(dto: CreateExpenseDto, actor: string) {
    const input = normalizedExpense(dto);
    const existing = await this.prisma.expense.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: EXPENSE_INCLUDE,
    });
    if (existing) return replayExpense(existing, input);
    if (input.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
      if (!supplier) throw new ValidationError('supplier_not_found', `Поставщик ${input.supplierId} не найден`);
    }
    try {
      return await this.audit.transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: { ...input, idempotencyKey: dto.idempotencyKey, requestedBy: actor },
          include: EXPENSE_INCLUDE,
        });
        return {
          result: expense,
          events: [{
            type: EventType.ExpenseSubmitted,
            actor,
            payload: { expenseId: expense.id, category: expense.category, amount: expense.amount, supplierId: expense.supplierId },
            refs: [expense.id, ...(expense.supplierId ? [expense.supplierId] : [])],
          }],
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.expense.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: EXPENSE_INCLUDE,
        });
        if (replay) return replayExpense(replay, input);
      }
      throw error;
    }
  }

  approve(id: string, actor: string) {
    return this.transitionSubmitted(id, actor, 'approved');
  }

  reject(id: string, note: string, actor: string) {
    return this.transitionSubmitted(id, actor, 'rejected', note.trim());
  }

  async pay(id: string, paymentKey: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} FOR UPDATE`;
      const expense = await tx.expense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
      if (!expense) throw new ValidationError('expense_not_found', `Расход ${id} не найден`);
      if (expense.status === 'paid') {
        if (expense.paymentKey !== paymentKey) {
          throw new ConflictError('expense_already_paid', 'Расход уже выплачен с другим idempotency key');
        }
        return { result: { ...expense, idempotent: true }, events: [] };
      }
      if (expense.status !== 'approved') {
        throw new ConflictError('expense_not_approved', 'Выплатить можно только согласованный расход');
      }
      const paid = await tx.expense.update({
        where: { id },
        data: { status: 'paid', paidBy: actor, paidAt: new Date(), paymentKey },
        include: EXPENSE_INCLUDE,
      });
      return {
        result: { ...paid, idempotent: false },
        events: [{
          type: EventType.ExpensePaid,
          actor,
          payload: { expenseId: id, amount: paid.amount, category: paid.category },
          refs: [id, ...(paid.supplierId ? [paid.supplierId] : [])],
        }],
      };
    });
  }

  private transitionSubmitted(id: string, actor: string, to: 'approved' | 'rejected', note?: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} FOR UPDATE`;
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new ValidationError('expense_not_found', `Расход ${id} не найден`);
      if (expense.status !== 'submitted') {
        throw new ConflictError('expense_already_reviewed', 'Расход уже рассмотрен');
      }
      const changedAt = new Date();
      const updated = await tx.expense.update({
        where: { id },
        data: to === 'approved'
          ? { status: to, approvedBy: actor, approvedAt: changedAt }
          : { status: to, rejectedBy: actor, rejectedAt: changedAt, rejectionNote: note },
        include: EXPENSE_INCLUDE,
      });
      return {
        result: updated,
        events: [{
          type: to === 'approved' ? EventType.ExpenseApproved : EventType.ExpenseRejected,
          actor,
          payload: { expenseId: id, amount: expense.amount, category: expense.category, ...(note ? { note } : {}) },
          refs: [id, ...(expense.supplierId ? [expense.supplierId] : [])],
        }],
      };
    });
  }
}

function normalizedExpense(dto: CreateExpenseDto) {
  return {
    category: dto.category,
    description: dto.description.trim(),
    amount: dto.amount,
    point: dto.point?.trim() || null,
    supplierId: dto.supplierId || null,
    incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : undefined,
  };
}

function replayExpense(
  expense: Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>,
  input: ReturnType<typeof normalizedExpense>,
) {
  const same = expense.category === input.category
    && expense.description === input.description
    && expense.amount === input.amount
    && expense.point === input.point
    && expense.supplierId === input.supplierId
    && (!input.incurredAt || expense.incurredAt.toISOString() === input.incurredAt.toISOString());
  if (!same) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим расходом');
  return { ...expense, idempotent: true };
}

function normalizePoint(point?: string) {
  return point?.trim() || '';
}

function publicBudget(budget: {
  id: string;
  period: string;
  category: string;
  point: string;
  amount: number;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...budget,
    point: budget.point || null,
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  };
}

function replayBudgetCommand(
  command: { period: string; category: string; point: string; amount: number; response: Prisma.JsonValue },
  input: { period: string; category: string; point: string; amount: number },
) {
  const same = command.period === input.period
    && command.category === input.category
    && command.point === input.point
    && command.amount === input.amount;
  if (!same) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован для другого бюджета');
  return { ...(command.response as Record<string, unknown>), idempotent: true };
}

function periodBounds(period: string): [Date, Date] {
  const [year, month] = period.split('-').map(Number);
  return [new Date(Date.UTC(year, month - 1, 1)), new Date(Date.UTC(year, month, 1))];
}
