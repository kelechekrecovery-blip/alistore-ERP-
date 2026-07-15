import { Injectable } from '@nestjs/common';
import { ExpenseStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExpenseDto,
  CreateFinanceSettlementDto,
  EXPENSE_CATEGORIES,
  FinanceAccountingQueryDto,
  FinanceSettlementQueryDto,
  PayExpenseDto,
  ResolveFinanceSettlementDto,
  CloseAccountingPeriodDto,
  SupplierAgingQueryDto,
  SetFinanceBudgetDto,
  SETTLEMENT_SOURCE_TYPES,
} from './finance.dto';
import { expenseAccountCode, normalBalance, postAccountingEntryOnTx } from './accounting-journal';

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

  listAccountingAccounts() {
    return this.prisma.accountingAccount.findMany({ orderBy: { code: 'asc' } });
  }

  listAccountingPeriods() {
    return this.prisma.accountingPeriod.findMany({ orderBy: { period: 'desc' }, take: 120 });
  }

  async closeAccountingPeriod(rawPeriod: string, dto: CloseAccountingPeriodDto, actor: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(rawPeriod)) {
      throw new ValidationError('invalid_accounting_period', 'Период должен быть в формате YYYY-MM');
    }
    const period = rawPeriod;
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accounting-period:${period}`}))`;
      const commandKey = `accounting-period:${period}:${dto.idempotencyKey}`;
      const existing = await tx.accountingPeriod.findUnique({ where: { period } });
      if (existing?.lastCloseIdempotencyKey === commandKey || existing?.status === 'hard_closed') {
        return { result: { ...existing, idempotent: true }, events: [] };
      }
      const closed = await tx.accountingPeriod.upsert({
        where: { period },
        create: { period, status: dto.status, lastCloseIdempotencyKey: commandKey, closedBy: actor, closedAt: new Date() },
        update: { status: dto.status, lastCloseIdempotencyKey: commandKey, closedBy: actor, closedAt: new Date() },
      });
      return {
        result: { ...closed, idempotent: false },
        events: [{ type: 'finance.accounting_period_closed', actor, payload: { period, status: dto.status }, refs: [closed.id] }],
      };
    });
  }

  async accountingJournal(query: FinanceAccountingQueryDto) {
    const period = accountingPeriod(query);
    return this.prisma.accountingJournalEntry.findMany({
      where: {
        occurredAt: { gte: period.from, lt: period.to },
        ...(normalizePoint(query.point) ? { point: normalizePoint(query.point) } : {}),
        ...(query.sourceType?.trim() ? { sourceType: query.sourceType.trim() } : {}),
        ...(query.accountCode?.trim() ? { lines: { some: { accountCode: query.accountCode.trim() } } } : {}),
      },
      include: { lines: { include: { account: true }, orderBy: { accountCode: 'asc' } } },
      orderBy: [{ occurredAt: 'desc' }, { postedAt: 'desc' }],
      take: 500,
    });
  }

  async supplierAging(query: SupplierAgingQueryDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new ValidationError('invalid_ap_as_of', 'Дата AP aging некорректна');
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: {
        status: { in: ['approved', 'paid'] },
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        createdAt: { lte: asOf },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, number: true } },
        accountingEntry: { select: { id: true, sourceType: true, sourceRef: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    const rows = invoices.map((invoice) => {
      const outstanding = invoice.status === 'paid' || (invoice.paidAt && invoice.paidAt <= asOf) ? 0 : invoice.amount;
      const dueDate = invoice.dueDate ?? invoice.createdAt;
      const ageDays = Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000));
      const bucket = outstanding === 0 ? 'paid' : ageDays === 0 ? 'current' : ageDays <= 30 ? '1_30' : ageDays <= 60 ? '31_60' : ageDays <= 90 ? '61_90' : '90_plus';
      return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier, purchaseOrder: invoice.purchaseOrder, amount: invoice.amount, outstanding, dueDate, ageDays, bucket, status: invoice.status, accountingEntry: invoice.accountingEntry };
    });
    const buckets = ['current', '1_30', '31_60', '61_90', '90_plus', 'paid'] as const;
    const totals = Object.fromEntries(buckets.map((bucket) => [bucket, rows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.amount, 0)]));
    return { asOf, rows, totals, totalOutstanding: rows.reduce((sum, row) => sum + row.outstanding, 0), supplierCount: new Set(rows.map((row) => row.supplier.id)).size };
  }

  async trialBalance(query: FinanceAccountingQueryDto) {
    const period = accountingPeriod(query);
    const point = normalizePoint(query.point);
    const accounts = await this.prisma.accountingAccount.findMany({
      where: query.accountCode?.trim() ? { code: query.accountCode.trim() } : undefined,
      include: {
        lines: {
          where: {
            entry: {
              occurredAt: { gte: period.from, lt: period.to },
              ...(point ? { point } : {}),
              ...(query.sourceType?.trim() ? { sourceType: query.sourceType.trim() } : {}),
            },
          },
          select: { debit: true, credit: true },
        },
      },
      orderBy: { code: 'asc' },
    });
    const rows = accounts.map((account) => {
      const debit = account.lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = account.lines.reduce((sum, line) => sum + line.credit, 0);
      return { code: account.code, name: account.name, type: account.type, debit, credit, balance: normalBalance(account.type, debit, credit) };
    });
    const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
    return {
      from: period.from, to: period.to, point: point || null, totalDebit, totalCredit,
      balanced: totalDebit === totalCredit,
      coverage: {
        complete: false,
        sourceTypes: ['expense.payment', 'payment.receipt', 'payment.refund'],
        note: 'Включены операционные расходы, продажи и возвраты; COD, долги, payroll, consignment и складская стоимость ещё не проведены полностью',
      },
      rows,
    };
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

  listSettlements() {
    return this.prisma.financeSettlementRun.findMany({
      include: { lines: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async settlementSources(query: FinanceSettlementQueryDto) {
    const period = settlementPeriod(query);
    const point = normalizePoint(query.point);
    const [payments, shifts, runs, used] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          createdAt: { gte: period.from, lt: period.to },
          method: { notIn: ['cash', 'gift_card'] },
          OR: [
            { amount: { gt: 0 }, status: { in: ['received', 'disputed'] } },
            { amount: { lt: 0 }, status: { in: ['refunded', 'disputed'] } },
          ],
        },
        include: {
          order: { select: { id: true, storePointCode: true, storePointName: true } },
          shift: { select: { point: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.cashShift.findMany({
        where: { closedAt: { gte: period.from, lt: period.to }, ...(point ? { point } : {}) },
        include: { payments: { where: { method: 'cash' }, select: { amount: true } } },
        orderBy: { closedAt: 'asc' },
      }),
      this.prisma.courierRun.findMany({
        where: {
          handedOver: true,
          handedOverAt: { gte: period.from, lt: period.to },
        },
        include: { orders: { select: { storePointCode: true, storePointName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.financeSettlementLine.findMany({ select: { sourceType: true, sourceRef: true } }),
    ]);
    const usedKeys = new Set(used.map((line) => `${line.sourceType}:${line.sourceRef}`));
    const candidates: SettlementSource[] = [];
    for (const payment of payments) {
      const paymentPoint = payment.shift?.point || payment.order?.storePointCode || payment.order?.storePointName || '';
      if (point && paymentPoint !== point) continue;
      const sourceType = payment.amount < 0 ? 'refund' : 'provider_payment';
      candidates.push({
        sourceType,
        sourceRef: payment.id,
        label: `${sourceType === 'refund' ? 'Возврат' : 'Платёж'} ${payment.method} · ${payment.orderId ?? payment.serviceWorkOrderId ?? payment.id}`,
        expectedAmount: payment.amount,
        suggestedActualAmount: payment.amount,
        point: paymentPoint || null,
        occurredAt: payment.createdAt,
      });
    }
    for (const shift of shifts) {
      const expected = shift.payments.reduce((sum, payment) => sum + payment.amount, 0);
      candidates.push({
        sourceType: 'pos_shift', sourceRef: shift.id, label: `POS смена · ${shift.point} · ${shift.staffId}`,
        expectedAmount: expected, suggestedActualAmount: (shift.closeCash ?? shift.openCash) - shift.openCash,
        point: shift.point, occurredAt: shift.closedAt ?? shift.openedAt,
      });
    }
    for (const run of runs) {
      const runPoint = courierRunPoint(run.orders);
      if (point && runPoint !== point) continue;
      candidates.push({
        sourceType: 'courier_cod', sourceRef: run.id, label: `COD рейс · ${run.courierId}`,
        expectedAmount: run.codTotal, suggestedActualAmount: run.handoverAmount ?? 0,
        point: runPoint, occurredAt: run.handedOverAt!,
      });
    }
    return candidates.filter((candidate) => !usedKeys.has(`${candidate.sourceType}:${candidate.sourceRef}`));
  }

  async createSettlement(dto: CreateFinanceSettlementDto, actor: string) {
    const period = settlementPeriod(dto);
    const point = normalizePoint(dto.point);
    const entries = dto.entries.map((entry) => ({
      sourceType: entry.sourceType,
      sourceRef: entry.sourceRef.trim(),
      actualAmount: entry.actualAmount,
      reason: entry.reason?.trim() || null,
    }));
    const fingerprint = { from: period.from.toISOString(), to: period.to.toISOString(), point, note: dto.note?.trim() || null, entries };
    if (new Set(entries.map((entry) => `${entry.sourceType}:${entry.sourceRef}`)).size !== entries.length) {
      throw new ValidationError('duplicate_settlement_source', 'Один источник нельзя добавить в сверку дважды');
    }
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-settlement:${dto.idempotencyKey}`}))`;
      const replay = await tx.financeSettlementCommand.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (replay) return { result: replaySettlementCommand(replay, 'create', fingerprint), events: [] };
      const sources = [] as SettlementSource[];
      for (const sourceKey of entries.map((entry) => `${entry.sourceType}:${entry.sourceRef}`).sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-source:${sourceKey}`}))`;
      }
      for (const entry of entries) {
        const source = await settlementSourceOnTx(tx, entry.sourceType, entry.sourceRef, period, point);
        const existing = await tx.financeSettlementLine.findUnique({
          where: { sourceType_sourceRef: { sourceType: entry.sourceType, sourceRef: entry.sourceRef } },
        });
        if (existing) throw new ConflictError('settlement_source_already_used', `Источник ${entry.sourceRef} уже сверен`);
        if (entry.actualAmount !== source.expectedAmount && !entry.reason) {
          throw new ValidationError('settlement_reason_required', `Расхождение по источнику ${entry.sourceRef} требует причину`);
        }
        sources.push(source);
      }
      const expectedTotal = sources.reduce((sum, source) => sum + source.expectedAmount, 0);
      const actualTotal = entries.reduce((sum, entry) => sum + entry.actualAmount, 0);
      const disputed = expectedTotal !== actualTotal || entries.some((entry, index) => entry.actualAmount !== sources[index].expectedAmount);
      const run = await tx.financeSettlementRun.create({
        data: {
          periodStart: period.from, periodEnd: period.to, point, note: dto.note?.trim() || null,
          expectedTotal, actualTotal, variance: actualTotal - expectedTotal,
          status: disputed ? 'disputed' : 'balanced', createdBy: actor,
          lines: {
            create: entries.map((entry, index) => ({
              sourceType: entry.sourceType, sourceRef: entry.sourceRef, label: sources[index].label,
              expectedAmount: sources[index].expectedAmount, actualAmount: entry.actualAmount,
              variance: entry.actualAmount - sources[index].expectedAmount,
              status: entry.actualAmount === sources[index].expectedAmount ? 'matched' : 'disputed', reason: entry.reason,
            })),
          },
        },
        include: { lines: { orderBy: { createdAt: 'asc' } } },
      });
      const response = { ...run, idempotent: false };
      await tx.financeSettlementCommand.create({
        data: { idempotencyKey: dto.idempotencyKey, action: 'create', runId: run.id, input: fingerprint as Prisma.InputJsonValue, response: jsonValue(response), createdBy: actor },
      });
      return { result: response, events: [{
        type: EventType.FinanceSettlementCreated, actor,
        payload: { runId: run.id, expectedTotal, actualTotal, variance: actualTotal - expectedTotal, sources: entries.length },
        refs: [run.id, ...entries.map((entry) => entry.sourceRef)],
      }] };
    });
  }

  async resolveSettlement(runId: string, dto: ResolveFinanceSettlementDto, actor: string) {
    const input = { runId, lineId: dto.lineId, adjustmentAmount: dto.adjustmentAmount, reason: dto.reason.trim() };
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-settlement:${dto.idempotencyKey}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-settlement:${runId}`}))`;
      const replay = await tx.financeSettlementCommand.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (replay) return { result: replaySettlementCommand(replay, 'resolve', input), events: [] };
      const run = await tx.financeSettlementRun.findUnique({ where: { id: runId }, include: { lines: true } });
      if (!run) throw new ValidationError('settlement_not_found', `Сверка ${runId} не найдена`);
      if (run.status === 'closed') throw new ConflictError('settlement_closed', 'Закрытую сверку нельзя изменить');
      const line = run.lines.find((candidate) => candidate.id === dto.lineId);
      if (!line) throw new ValidationError('settlement_line_not_found', `Строка ${dto.lineId} не найдена в сверке`);
      await tx.financeSettlementLine.update({
        where: { id: line.id },
        data: {
          adjustmentAmount: dto.adjustmentAmount,
          variance: line.actualAmount + dto.adjustmentAmount - line.expectedAmount,
          status: line.actualAmount + dto.adjustmentAmount === line.expectedAmount ? 'matched' : 'disputed',
          resolutionReason: dto.reason.trim(), resolvedBy: actor, resolvedAt: new Date(),
        },
      });
      const lines = await tx.financeSettlementLine.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } });
      const expectedTotal = lines.reduce((sum, current) => sum + current.expectedAmount, 0);
      const actualTotal = lines.reduce((sum, current) => sum + current.actualAmount, 0);
      const adjustmentTotal = lines.reduce((sum, current) => sum + current.adjustmentAmount, 0);
      const updated = await tx.financeSettlementRun.update({
        where: { id: runId },
        data: { expectedTotal, actualTotal, adjustmentTotal, variance: actualTotal + adjustmentTotal - expectedTotal, status: lines.some((current) => current.variance !== 0) ? 'disputed' : 'balanced' },
        include: { lines: { orderBy: { createdAt: 'asc' } } },
      });
      const response = { ...updated, idempotent: false };
      await tx.financeSettlementCommand.create({ data: { idempotencyKey: dto.idempotencyKey, action: 'resolve', runId, input: input as Prisma.InputJsonValue, response: jsonValue(response), createdBy: actor } });
      const variance = line.actualAmount + dto.adjustmentAmount - line.expectedAmount;
      return { result: response, events: [
        { type: EventType.FinanceSettlementAdjustmentCreated, actor, payload: { runId, lineId: line.id, sourceType: line.sourceType, sourceRef: line.sourceRef, observedActual: line.actualAmount, adjustmentAmount: dto.adjustmentAmount, reason: dto.reason.trim() }, refs: [runId, line.sourceRef] },
        { type: EventType.FinanceSettlementDisputeResolved, actor, payload: { runId, lineId: line.id, previousVariance: line.variance, variance, reason: dto.reason.trim() }, refs: [runId, line.sourceRef] },
      ] };
    });
  }

  async closeSettlement(runId: string, idempotencyKey: string, actor: string) {
    const input = { runId };
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-settlement:${idempotencyKey}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-settlement:${runId}`}))`;
      const replay = await tx.financeSettlementCommand.findUnique({ where: { idempotencyKey } });
      if (replay) return { result: replaySettlementCommand(replay, 'close', input), events: [] };
      const run = await tx.financeSettlementRun.findUnique({ where: { id: runId }, include: { lines: { orderBy: { createdAt: 'asc' } } } });
      if (!run) throw new ValidationError('settlement_not_found', `Сверка ${runId} не найдена`);
      if (run.status === 'closed') throw new ConflictError('settlement_closed', 'Сверка уже закрыта другим ключом');
      if (run.variance !== 0 || run.lines.some((line) => line.variance !== 0)) {
        throw new ConflictError('settlement_has_disputes', 'Сначала устраните все расхождения');
      }
      const now = new Date();
      const paymentLines = run.lines.filter((line) => line.sourceType === 'provider_payment' || line.sourceType === 'refund');
      for (const line of paymentLines) {
        const changed = await tx.payment.updateMany({ where: { id: line.sourceRef, status: { in: ['received', 'refunded', 'disputed'] } }, data: { status: 'reconciled' } });
        if (changed.count !== 1) throw new ConflictError('settlement_source_changed', `Платёж ${line.sourceRef} изменился во время сверки`);
      }
      await tx.financeSettlementLine.updateMany({ where: { runId }, data: { status: 'reconciled', reconciledAt: now } });
      const closed = await tx.financeSettlementRun.update({ where: { id: runId }, data: { status: 'closed', closedAt: now, closedBy: actor }, include: { lines: { orderBy: { createdAt: 'asc' } } } });
      const response = { ...closed, idempotent: false };
      await tx.financeSettlementCommand.create({ data: { idempotencyKey, action: 'close', runId, input: input as Prisma.InputJsonValue, response: jsonValue(response), createdBy: actor } });
      return { result: response, events: [
        ...paymentLines.map((line) => ({ type: EventType.PaymentReconciled, actor, payload: { runId, paymentId: line.sourceRef, amount: line.expectedAmount }, refs: [runId, line.sourceRef] })),
        { type: EventType.FinanceSettlementClosed, actor, payload: { runId, expectedTotal: run.expectedTotal, actualTotal: run.actualTotal, sources: run.lines.length }, refs: [runId, ...run.lines.map((line) => line.sourceRef)] },
      ] };
    });
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

  async pay(id: string, dto: PayExpenseDto, actor: string) {
    try {
      return await this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} FOR UPDATE`;
      const expense = await tx.expense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
      if (!expense) throw new ValidationError('expense_not_found', `Расход ${id} не найден`);
      if (expense.status === 'paid') {
        if (expense.paymentKey !== dto.idempotencyKey || expense.paymentAccountCode !== dto.fundingAccountCode || expense.paymentReference !== (dto.paymentReference?.trim() || null)) {
          throw new ConflictError('expense_already_paid', 'Расход уже выплачен с другим idempotency key');
        }
        const entry = await tx.accountingJournalEntry.findUnique({
          where: { sourceType_sourceRef: { sourceType: 'expense.payment', sourceRef: expense.id } },
          select: { id: true },
        });
        return { result: { ...expense, accountingEntryId: entry?.id ?? null, idempotent: true }, events: [] };
      }
      if (expense.status !== 'approved') {
        throw new ConflictError('expense_not_approved', 'Выплатить можно только согласованный расход');
      }
      const paidAt = new Date();
      const entry = await postAccountingEntryOnTx(tx, {
        idempotencyKey: dto.idempotencyKey,
        sourceType: 'expense.payment',
        sourceRef: expense.id,
        description: expense.description,
        point: expense.point,
        occurredAt: paidAt,
        createdBy: actor,
        lines: [
          { accountCode: expenseAccountCode(expense.category), debit: expense.amount, memo: expense.description },
          { accountCode: dto.fundingAccountCode, credit: expense.amount, memo: dto.paymentReference },
        ],
      });
      const paid = await tx.expense.update({
        where: { id },
        data: {
          status: 'paid', paidBy: actor, paidAt, paymentKey: dto.idempotencyKey,
          paymentAccountCode: dto.fundingAccountCode, paymentReference: dto.paymentReference?.trim() || null,
        },
        include: EXPENSE_INCLUDE,
      });
      return {
        result: { ...paid, accountingEntryId: entry.id, idempotent: false },
        events: [
          {
            type: EventType.ExpensePaid,
            actor,
            payload: { expenseId: id, amount: paid.amount, category: paid.category, fundingAccountCode: dto.fundingAccountCode, paymentReference: paid.paymentReference, accountingEntryId: entry.id },
            refs: [id, entry.id, ...(paid.supplierId ? [paid.supplierId] : [])],
          },
          {
            type: EventType.AccountingEntryPosted,
            actor,
            payload: { accountingEntryId: entry.id, sourceType: entry.sourceType, sourceRef: entry.sourceRef, debit: paid.amount, credit: paid.amount },
            refs: [entry.id, id],
          },
        ],
      };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('expense_payment_idempotency_conflict', 'Ключ выплаты уже использован для другой операции');
      }
      throw error;
    }
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

type SettlementSourceType = (typeof SETTLEMENT_SOURCE_TYPES)[number];
type SettlementSource = {
  sourceType: SettlementSourceType;
  sourceRef: string;
  label: string;
  expectedAmount: number;
  suggestedActualAmount: number;
  point: string | null;
  occurredAt: Date;
};

function settlementPeriod(query: FinanceSettlementQueryDto) {
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (!(from < to)) throw new ValidationError('invalid_settlement_period', 'Конец периода должен быть позже начала');
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new ValidationError('settlement_period_too_long', 'Период сверки не может превышать 366 дней');
  return { from, to };
}

function accountingPeriod(query: FinanceAccountingQueryDto) {
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (!(from < to)) throw new ValidationError('invalid_accounting_period', 'Конец периода должен быть позже начала');
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new ValidationError('accounting_period_too_long', 'Период отчёта не может превышать 366 дней');
  return { from, to };
}

async function settlementSourceOnTx(
  tx: Prisma.TransactionClient,
  sourceType: SettlementSourceType,
  sourceRef: string,
  period: { from: Date; to: Date },
  point: string,
): Promise<SettlementSource> {
  if (sourceType === 'provider_payment' || sourceType === 'refund') {
    const payment = await tx.payment.findUnique({ where: { id: sourceRef }, include: { order: { select: { storePointCode: true, storePointName: true } }, shift: { select: { point: true } } } });
    const expectedSign = sourceType === 'refund' ? payment?.amount && payment.amount < 0 : payment?.amount && payment.amount > 0;
    const expectedStatus = sourceType === 'refund'
      ? payment && ['refunded', 'disputed'].includes(payment.status)
      : payment && ['received', 'disputed'].includes(payment.status);
    const paymentPoint = payment?.shift?.point || payment?.order?.storePointCode || payment?.order?.storePointName || '';
    if (!payment || !expectedSign || !expectedStatus || ['cash', 'gift_card'].includes(payment.method) || payment.createdAt < period.from || payment.createdAt >= period.to || (point && paymentPoint !== point)) {
      throw new ValidationError('settlement_source_invalid', `Платёж ${sourceRef} недоступен для этой сверки`);
    }
    return { sourceType, sourceRef, label: `${sourceType === 'refund' ? 'Возврат' : 'Платёж'} ${payment.method} · ${payment.orderId ?? payment.serviceWorkOrderId ?? payment.id}`, expectedAmount: payment.amount, suggestedActualAmount: payment.amount, point: paymentPoint || null, occurredAt: payment.createdAt };
  }
  if (sourceType === 'pos_shift') {
    const shift = await tx.cashShift.findUnique({ where: { id: sourceRef }, include: { payments: { where: { method: 'cash' }, select: { amount: true } } } });
    if (!shift?.closedAt || shift.closedAt < period.from || shift.closedAt >= period.to || (point && shift.point !== point)) throw new ValidationError('settlement_source_invalid', `POS смена ${sourceRef} недоступна для этой сверки`);
    const expected = shift.payments.reduce((sum, payment) => sum + payment.amount, 0);
    return { sourceType, sourceRef, label: `POS смена · ${shift.point} · ${shift.staffId}`, expectedAmount: expected, suggestedActualAmount: (shift.closeCash ?? shift.openCash) - shift.openCash, point: shift.point, occurredAt: shift.closedAt };
  }
  const run = await tx.courierRun.findUnique({ where: { id: sourceRef }, include: { orders: { select: { storePointCode: true, storePointName: true } } } });
  const runPoint = courierRunPoint(run?.orders ?? []) ?? '';
  if (!run?.handedOver || !run.handedOverAt || run.handedOverAt < period.from || run.handedOverAt >= period.to || (point && runPoint !== point)) throw new ValidationError('settlement_source_invalid', `COD рейс ${sourceRef} недоступен для этой сверки`);
  return { sourceType, sourceRef, label: `COD рейс · ${run.courierId}`, expectedAmount: run.codTotal, suggestedActualAmount: run.handoverAmount ?? 0, point: runPoint || null, occurredAt: run.handedOverAt };
}

function courierRunPoint(orders: Array<{ storePointCode: string | null; storePointName: string | null }>): string | null {
  const points = new Set(orders.map((order) => order.storePointCode || order.storePointName).filter((value): value is string => Boolean(value)));
  return points.size === 1 ? [...points][0] : null;
}

function replaySettlementCommand(command: { action: string; input: Prisma.JsonValue; response: Prisma.JsonValue }, action: string, input: unknown) {
  if (command.action !== action || stableJson(command.input) !== stableJson(input)) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован другой командой сверки');
  return { ...(command.response as Record<string, unknown>), idempotent: true };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
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
