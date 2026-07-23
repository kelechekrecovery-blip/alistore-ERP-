import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ExpenseStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCurrencyRateDto,
  CreateExpenseDto,
  CreateFinanceSettlementDto,
  EXPENSE_CATEGORIES,
  FinanceAccountingQueryDto,
  FinanceSettlementQueryDto,
  PayExpenseDto,
  ResolveFinanceSettlementDto,
  CloseAccountingPeriodDto,
  SupplierAgingQueryDto,
  ReverseAccountingEntryDto,
  ImportBankStatementDto,
  ReconcileBankStatementLineDto,
  SetFinanceBudgetDto,
  CreateCashIncassationDto,
  CurrencyRateQueryDto,
  SETTLEMENT_SOURCE_TYPES,
  SettleTaxPeriodDto,
  CreateFixedAssetDto,
  CreateManualAdjustmentDto,
  DepreciateFixedAssetDto,
  CreateOpeningBalanceDto,
  AccountableAdvanceQueryDto,
  ArAgingQueryDto,
  CreateAccountableAdvanceDto,
  SettleAccountableAdvanceDto,
  CloseAccountableAdvanceDto,
  FxExposureQueryDto,
} from './finance.dto';
import { expenseAccountCode, normalBalance, postAccountingEntryOnTx } from './accounting-journal';
import { expenseAccountingSnapshot } from './expense-accounting';

const EXPENSE_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  exchangeRate: { select: { id: true, currency: true, baseCurrency: true, rateMicros: true, effectiveAt: true, source: true } },
} satisfies Prisma.ExpenseInclude;

function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : value === null || value === undefined ? '' : String(value);
  const safeText = typeof value === 'string' && /^[-=+@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

/**
 * Where an incassation may send cash. Bank is a transfer between assets; the
 * owner draw is a distribution against equity — different account type, so the
 * type check below is per-destination rather than a blanket `asset`.
 */
const INCASSATION_DESTINATIONS: Record<string, { type: 'asset' | 'equity'; memo: string; label: string }> = {
  '1010': { type: 'asset', memo: 'Поступление инкассации на расчетный счет', label: 'Инкассация' },
  '3000': { type: 'equity', memo: 'Выемка наличных владельцем', label: 'Выемка владельцем' },
};
const DEFAULT_INCASSATION_DESTINATION = '1010';

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

  async accountingPeriodReadiness(rawPeriod: string) {
    const period = validateMonth(rawPeriod);
    return this.prisma.$transaction((tx) => accountingPeriodReadinessOnTx(tx, period));
  }

  listOpeningBalances() {
    return this.prisma.accountingOpeningBalance.findMany({
      include: { accountingEntry: { include: { lines: { orderBy: { accountCode: 'asc' } } } }, lines: { orderBy: { accountCode: 'asc' } } },
      orderBy: { period: 'desc' },
      take: 120,
    });
  }

  listFixedAssets() {
    return this.prisma.fixedAsset.findMany({
      include: {
        acquisitionAccountingEntry: { include: { lines: { orderBy: { accountCode: 'asc' } } } },
        depreciationEntries: { include: { accountingEntry: { include: { lines: { orderBy: { accountCode: 'asc' } } } } }, orderBy: { period: 'asc' } },
      },
      orderBy: [{ status: 'asc' }, { inServiceAt: 'asc' }],
      take: 500,
    });
  }

  listAccountableAdvances(query: AccountableAdvanceQueryDto) {
    return this.prisma.accountableAdvance.findMany({
      where: {
        ...(query.staffId ? { staffId: query.staffId.trim() } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        staff: { select: { id: true, username: true, role: true, point: true } },
        accountingEntry: { include: { lines: { orderBy: { accountCode: 'asc' } } } },
        settlements: { include: { accountingEntry: { include: { lines: { orderBy: { accountCode: 'asc' } } } } }, orderBy: { settledAt: 'asc' } },
        returns: { include: { accountingEntry: { include: { lines: { orderBy: { accountCode: 'asc' } } } } }, orderBy: { returnedAt: 'asc' } },
        reimbursements: { include: { accountingEntry: { include: { lines: { orderBy: { accountCode: 'asc' } } } } }, orderBy: { reimbursedAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }).then((rows) => rows.map((row) => accountableAdvanceResponse(row)));
  }

  async createAccountableAdvance(dto: CreateAccountableAdvanceDto, actor: string) {
    const purpose = dto.purpose.trim();
    const paymentReference = dto.paymentReference.trim();
    const dueAt = optionalFinanceDate(dto.dueAt, 'dueAt');
    const existing = await this.prisma.accountableAdvance.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true },
    });
    if (existing) return replayAccountableAdvance(existing, { staffId: dto.staffId, amount: dto.amount, purpose, point: dto.point?.trim() || existing.point, dueAt, fundingAccountCode: dto.fundingAccountCode, paymentReference });

    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accountable-advance-key:${dto.idempotencyKey}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accountable-advance-staff:${dto.staffId}`}))`;
      const replay = await tx.accountableAdvance.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true },
      });
      if (replay) return { result: replayAccountableAdvance(replay, { staffId: dto.staffId, amount: dto.amount, purpose, point: dto.point?.trim() || replay.point, dueAt, fundingAccountCode: dto.fundingAccountCode, paymentReference }), events: [] };
      const staff = await tx.staffUser.findUnique({ where: { id: dto.staffId }, select: { id: true, username: true, role: true, point: true, active: true } });
      if (!staff) throw new ValidationError('accountable_advance_staff_not_found', 'Сотрудник для аванса не найден');
      if (!staff.active) throw new ConflictError('accountable_advance_staff_inactive', 'Неактивному сотруднику нельзя выдать аванс');
      const point = dto.point?.trim() || staff.point;
      if (dueAt && dueAt < new Date()) throw new ValidationError('accountable_advance_due_date_invalid', 'Срок отчёта не может быть в прошлом');
      const advanceId = randomUUID();
      const entry = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:accountable-advance:issue:${advanceId}`,
        sourceType: 'finance.accountable_advance.issue',
        sourceRef: advanceId,
        description: `Выдача подотчётного аванса ${paymentReference}`,
        point,
        documentAmount: dto.amount,
        baseAmount: dto.amount,
        occurredAt: new Date(),
        createdBy: actor,
        lines: [
          { accountCode: '1250', debit: dto.amount, memo: `Подотчёт: ${staff.username} · ${purpose}` },
          { accountCode: dto.fundingAccountCode, credit: dto.amount, memo: `Выдача по документу ${paymentReference}` },
        ],
      });
      const advance = await tx.accountableAdvance.create({
        data: { id: advanceId, staffId: dto.staffId, idempotencyKey: dto.idempotencyKey, purpose, point, amount: dto.amount, fundingAccountCode: dto.fundingAccountCode, paymentReference, issuedBy: actor, dueAt, accountingEntryId: entry.id },
        include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true },
      });
      return {
        result: { ...accountableAdvanceResponse(advance), idempotent: false },
        events: [
          { type: EventType.AccountableAdvanceIssued, actor, payload: { advanceId, staffId: dto.staffId, amount: dto.amount, point, accountingEntryId: entry.id }, refs: [advanceId, dto.staffId, entry.id] },
          { type: EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: entry.id, sourceType: 'finance.accountable_advance.issue', sourceRef: advanceId, amount: dto.amount }, refs: [entry.id, advanceId, dto.staffId] },
        ],
      };
    });
  }

  async settleAccountableAdvance(id: string, dto: SettleAccountableAdvanceDto, actor: string) {
    const description = dto.description.trim();
    const existing = await this.prisma.accountableAdvanceSettlement.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { advance: { include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true } }, accountingEntry: { include: { lines: true } } },
    });
    if (existing) return replayAccountableAdvanceSettlement(existing, id, dto.amount, dto.expenseAccountCode, description);

    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accountable-advance:${id}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accountable-advance-settlement-key:${dto.idempotencyKey}`}))`;
      const replay = await tx.accountableAdvanceSettlement.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { advance: { include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true } }, accountingEntry: { include: { lines: true } } },
      });
      if (replay) return { result: replayAccountableAdvanceSettlement(replay, id, dto.amount, dto.expenseAccountCode, description), events: [] };
      const advance = await tx.accountableAdvance.findUnique({ where: { id }, include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true } });
      if (!advance) throw new ValidationError('accountable_advance_not_found', 'Подотчётный аванс не найден');
      if (advance.status === 'settled') throw new ConflictError('accountable_advance_settled', 'Закрытый подотчётный аванс нельзя дополнить расходом');
      const settlementId = randomUUID();
      const entry = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:accountable-advance:settle:${settlementId}`,
        sourceType: 'finance.accountable_advance.settlement',
        sourceRef: settlementId,
        description,
        point: advance.point,
        documentAmount: dto.amount,
        baseAmount: dto.amount,
        occurredAt: new Date(),
        createdBy: actor,
        lines: [
          { accountCode: dto.expenseAccountCode, debit: dto.amount, memo: description },
          { accountCode: '1250', credit: dto.amount, memo: `Закрытие подотчёта ${advance.staff.username}` },
        ],
      });
      const settlement = await tx.accountableAdvanceSettlement.create({ data: { id: settlementId, advanceId: id, idempotencyKey: dto.idempotencyKey, amount: dto.amount, expenseAccountCode: dto.expenseAccountCode, description, settledBy: actor, accountingEntryId: entry.id }, include: { advance: true, accountingEntry: { include: { lines: true } } } });
      const settledAmount = advance.settledAmount + dto.amount;
      const status = accountableAdvanceStatus(advance.amount, settledAmount, advance.returnedAmount, advance.reimbursedAmount);
      const updated = await tx.accountableAdvance.update({ where: { id }, data: { settledAmount, status }, include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true } });
      return {
        result: { advance: accountableAdvanceResponse(updated), settlement: accountableAdvanceActionResponse(settlement), idempotent: false },
        events: [
          { type: EventType.AccountableAdvanceSettled, actor, payload: { advanceId: id, settlementId, staffId: advance.staffId, amount: dto.amount, balance: accountableAdvanceBalance(updated), accountingEntryId: entry.id }, refs: [id, settlementId, advance.staffId, entry.id] },
          { type: EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: entry.id, sourceType: 'finance.accountable_advance.settlement', sourceRef: settlementId, amount: dto.amount }, refs: [entry.id, settlementId, id] },
        ],
      };
    });
  }

  async returnAccountableAdvance(id: string, dto: CloseAccountableAdvanceDto, actor: string) {
    return this.closeAccountableAdvance(id, dto, actor, 'return');
  }

  async reimburseAccountableAdvance(id: string, dto: CloseAccountableAdvanceDto, actor: string) {
    return this.closeAccountableAdvance(id, dto, actor, 'reimburse');
  }

  private async closeAccountableAdvance(id: string, dto: CloseAccountableAdvanceDto, actor: string, kind: 'return' | 'reimburse') {
    const existing = kind === 'return'
      ? await this.prisma.accountableAdvanceReturn.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { advance: { include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true } }, accountingEntry: { include: { lines: true } } } })
      : await this.prisma.accountableAdvanceReimbursement.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { advance: { include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true } }, accountingEntry: { include: { lines: true } } } });
    if (existing) return replayAccountableAdvanceClose(existing, id, dto, kind);

    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accountable-advance:${id}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accountable-advance-close-key:${dto.idempotencyKey}`}))`;
      const advance = await tx.accountableAdvance.findUnique({ where: { id }, include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true } });
      if (!advance) throw new ValidationError('accountable_advance_not_found', 'Подотчётный аванс не найден');
      const balance = accountableAdvanceBalance(advance);
      if (kind === 'return' && balance <= 0) throw new ConflictError('accountable_advance_no_return_due', 'Нет остатка аванса для возврата');
      if (kind === 'reimburse' && balance >= 0) throw new ConflictError('accountable_advance_no_reimbursement_due', 'Нет перерасхода для компенсации');
      const due = kind === 'return' ? balance : -balance;
      if (dto.amount > due) throw new ConflictError('accountable_advance_close_exceeds_balance', `Сумма превышает доступный остаток: ${due}`);
      const actionId = randomUUID();
      const sourceType = kind === 'return' ? 'finance.accountable_advance.return' : 'finance.accountable_advance.reimbursement';
      const entry = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:accountable-advance:${kind}:${actionId}`,
        sourceType,
        sourceRef: actionId,
        description: `${kind === 'return' ? 'Возврат остатка' : 'Компенсация перерасхода'} подотчётного аванса ${advance.staff.username}`,
        point: advance.point,
        documentAmount: dto.amount,
        baseAmount: dto.amount,
        occurredAt: new Date(),
        createdBy: actor,
        lines: kind === 'return'
          ? [{ accountCode: dto.fundingAccountCode, debit: dto.amount, memo: `Возврат ${dto.paymentReference}` }, { accountCode: '1250', credit: dto.amount, memo: 'Уменьшение подотчётного аванса' }]
          : [{ accountCode: '1250', debit: dto.amount, memo: 'Компенсация расходов сотрудника' }, { accountCode: dto.fundingAccountCode, credit: dto.amount, memo: `Компенсация ${dto.paymentReference}` }],
      });
      const settledAmount = advance.settledAmount;
      const returnedAmount = advance.returnedAmount + (kind === 'return' ? dto.amount : 0);
      const reimbursedAmount = advance.reimbursedAmount + (kind === 'reimburse' ? dto.amount : 0);
      const action = kind === 'return'
        ? await tx.accountableAdvanceReturn.create({ data: { id: actionId, advanceId: id, idempotencyKey: dto.idempotencyKey, amount: dto.amount, fundingAccountCode: dto.fundingAccountCode, paymentReference: dto.paymentReference.trim(), returnedBy: actor, accountingEntryId: entry.id }, include: { accountingEntry: { include: { lines: true } } } })
        : await tx.accountableAdvanceReimbursement.create({ data: { id: actionId, advanceId: id, idempotencyKey: dto.idempotencyKey, amount: dto.amount, fundingAccountCode: dto.fundingAccountCode, paymentReference: dto.paymentReference.trim(), reimbursedBy: actor, accountingEntryId: entry.id }, include: { accountingEntry: { include: { lines: true } } } });
      const status = accountableAdvanceStatus(advance.amount, settledAmount, returnedAmount, reimbursedAmount);
      const updated = await tx.accountableAdvance.update({ where: { id }, data: { returnedAmount, reimbursedAmount, status }, include: { staff: true, accountingEntry: { include: { lines: true } }, settlements: true, returns: true, reimbursements: true } });
      const eventType = kind === 'return' ? EventType.AccountableAdvanceReturned : EventType.AccountableAdvanceReimbursed;
      return {
        result: { advance: accountableAdvanceResponse(updated), [kind]: action, idempotent: false },
        events: [
          { type: eventType, actor, payload: { advanceId: id, actionId, staffId: advance.staffId, amount: dto.amount, balance: accountableAdvanceBalance(updated), accountingEntryId: entry.id }, refs: [id, actionId, advance.staffId, entry.id] },
          { type: EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: entry.id, sourceType, sourceRef: actionId, amount: dto.amount }, refs: [entry.id, actionId, id] },
        ],
      };
    });
  }

  async createFixedAsset(dto: CreateFixedAssetDto, actor: string) {
    const acquiredAt = fixedAssetDate(dto.acquiredAt, 'acquiredAt');
    const inServiceAt = fixedAssetDate(dto.inServiceAt ?? dto.acquiredAt, 'inServiceAt');
    if (inServiceAt < acquiredAt) throw new ValidationError('fixed_asset_service_before_acquisition', 'Дата ввода в эксплуатацию не может быть раньше покупки');
    if (dto.usefulLifeMonths > dto.acquisitionCost) throw new ValidationError('fixed_asset_useful_life_too_long', 'Срок амортизации в месяцах не может превышать стоимость в сомах');
    const input = {
      assetNumber: dto.assetNumber.trim(),
      name: dto.name.trim(),
      category: dto.category.trim(),
      serialNumber: dto.serialNumber?.trim() || null,
      acquisitionCost: dto.acquisitionCost,
      usefulLifeMonths: dto.usefulLifeMonths,
      acquiredAt,
      inServiceAt,
      fundingAccountCode: dto.fundingAccountCode ?? '1010',
      externalRef: dto.externalRef?.trim() || null,
    };
    const existing = await this.prisma.fixedAsset.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { acquisitionAccountingEntry: { include: { lines: true } }, depreciationEntries: { orderBy: { period: 'asc' } } },
    });
    if (existing) return replayFixedAsset(existing, input);

    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fixed-asset:${input.assetNumber}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fixed-asset-key:${dto.idempotencyKey}`}))`;
      const replay = await tx.fixedAsset.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { acquisitionAccountingEntry: { include: { lines: true } }, depreciationEntries: { orderBy: { period: 'asc' } } },
      });
      if (replay) return { result: replayFixedAsset(replay, input), events: [] };
      const byNumber = await tx.fixedAsset.findUnique({ where: { assetNumber: input.assetNumber }, select: { id: true } });
      if (byNumber) throw new ConflictError('fixed_asset_number_exists', 'Инвентарный номер основного средства уже используется');

      const assetId = randomUUID();
      const accountingEntry = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:fixed-asset:acquisition:${assetId}`,
        sourceType: 'finance.fixed_asset.acquisition',
        sourceRef: assetId,
        description: `Приобретение основного средства ${input.assetNumber}`,
        documentAmount: input.acquisitionCost,
        baseAmount: input.acquisitionCost,
        occurredAt: acquiredAt,
        createdBy: actor,
        lines: [
          { accountCode: '1400', debit: input.acquisitionCost, memo: `Постановка на учёт: ${input.name}` },
          { accountCode: input.fundingAccountCode, credit: input.acquisitionCost, memo: `Оплата основного средства${input.externalRef ? ` · ${input.externalRef}` : ''}` },
        ],
      });
      const asset = await tx.fixedAsset.create({
        data: { id: assetId, ...input, idempotencyKey: dto.idempotencyKey, createdBy: actor, acquisitionAccountingEntryId: accountingEntry.id },
        include: { acquisitionAccountingEntry: { include: { lines: true } }, depreciationEntries: true },
      });
      return {
        result: { ...asset, idempotent: false },
        events: [
          { type: EventType.FixedAssetAcquired, actor, payload: { fixedAssetId: asset.id, assetNumber: asset.assetNumber, acquisitionCost: asset.acquisitionCost, accountingEntryId: accountingEntry.id }, refs: [asset.id, asset.assetNumber, accountingEntry.id] },
          { type: EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: accountingEntry.id, sourceType: 'finance.fixed_asset.acquisition', sourceRef: asset.id, amount: asset.acquisitionCost }, refs: [accountingEntry.id, asset.id, asset.assetNumber] },
        ],
      };
    });
  }

  async depreciateFixedAsset(id: string, dto: DepreciateFixedAssetDto, actor: string) {
    const period = validateMonth(dto.period);
    const existing = await this.prisma.fixedAssetDepreciation.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { fixedAsset: true, accountingEntry: { include: { lines: true } } },
    });
    if (existing) return replayFixedAssetDepreciation(existing, id, period);

    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fixed-asset-depreciation:${id}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fixed-asset-depreciation-key:${dto.idempotencyKey}`}))`;
      const replay = await tx.fixedAssetDepreciation.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { fixedAsset: true, accountingEntry: { include: { lines: true } } },
      });
      if (replay) return { result: replayFixedAssetDepreciation(replay, id, period), events: [] };
      const asset = await tx.fixedAsset.findUnique({ where: { id }, include: { depreciationEntries: { orderBy: { period: 'asc' } } } });
      if (!asset) throw new ValidationError('fixed_asset_not_found', 'Основное средство не найдено');
      if (asset.status === 'disposed') throw new ConflictError('fixed_asset_disposed', 'Для списанного основного средства амортизация запрещена');
      const index = asset.depreciationEntries.length;
      if (index >= asset.usefulLifeMonths || asset.accumulatedDepreciation >= asset.acquisitionCost) throw new ConflictError('fixed_asset_fully_depreciated', 'Основное средство уже полностью самортизировано');
      const expectedPeriod = addMonthsToPeriod(monthKey(asset.inServiceAt), index);
      if (period !== expectedPeriod) throw new ConflictError('fixed_asset_depreciation_sequence', `Следующий период амортизации: ${expectedPeriod}`);
      const amount = fixedAssetDepreciationAmount(asset.acquisitionCost, asset.usefulLifeMonths, index);
      const openingAccumulated = asset.accumulatedDepreciation;
      const closingAccumulated = openingAccumulated + amount;
      const depreciationId = randomUUID();
      const accountingEntry = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:fixed-asset:depreciation:${depreciationId}`,
        sourceType: 'finance.fixed_asset.depreciation',
        sourceRef: depreciationId,
        description: `Амортизация ${asset.assetNumber} за ${period}`,
        point: null,
        documentAmount: amount,
        baseAmount: amount,
        occurredAt: new Date(periodBounds(period)[1].getTime() - 1),
        createdBy: actor,
        lines: [
          { accountCode: '6700', debit: amount, memo: `Расходы на амортизацию: ${asset.name}` },
          { accountCode: '1410', credit: amount, memo: `Накопленная амортизация: ${asset.assetNumber}` },
        ],
      });
      const depreciation = await tx.fixedAssetDepreciation.create({
        data: { id: depreciationId, fixedAssetId: asset.id, period, amount, openingAccumulated, closingAccumulated, idempotencyKey: dto.idempotencyKey, accountingEntryId: accountingEntry.id, postedBy: actor },
        include: { fixedAsset: true, accountingEntry: { include: { lines: true } } },
      });
      const updatedAsset = await tx.fixedAsset.update({ where: { id: asset.id }, data: { accumulatedDepreciation: closingAccumulated, status: closingAccumulated >= asset.acquisitionCost ? 'fully_depreciated' : 'active' } });
      return {
        result: { ...depreciation, fixedAsset: updatedAsset, idempotent: false },
        events: [
          { type: EventType.FixedAssetDepreciated, actor, payload: { fixedAssetId: asset.id, depreciationId, assetNumber: asset.assetNumber, period, amount, accountingEntryId: accountingEntry.id }, refs: [asset.id, depreciationId, accountingEntry.id, period] },
          { type: EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: accountingEntry.id, sourceType: 'finance.fixed_asset.depreciation', sourceRef: depreciationId, amount }, refs: [accountingEntry.id, depreciationId, asset.id, period] },
        ],
      };
    });
  }

  async createOpeningBalance(dto: CreateOpeningBalanceDto, actor: string) {
    const period = validateMonth(dto.period);
    const documentNumber = dto.documentNumber.trim();
    const description = dto.description.trim();
    const lines = dto.lines.map((line) => ({
      accountCode: line.accountCode.trim(),
      debit: line.debit,
      credit: line.credit,
      memo: line.memo?.trim() || null,
    }));
    if (new Set(lines.map((line) => line.accountCode)).size !== lines.length) {
      throw new ValidationError('opening_balance_duplicate_account', 'Счёт может присутствовать в opening balance только один раз');
    }
    if (lines.some((line) => (line.debit > 0 && line.credit > 0) || (line.debit === 0 && line.credit === 0))) {
      throw new ValidationError('opening_balance_line_side_invalid', 'Каждая строка opening balance должна иметь только дебет или кредит');
    }
    const debit = lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = lines.reduce((sum, line) => sum + line.credit, 0);
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit <= 0 || debit !== credit) {
      throw new ValidationError('opening_balance_unbalanced', 'Opening balance должен быть сбалансирован и больше нуля');
    }
    const fingerprint = { period, documentNumber, description, lines: [...lines].sort((a, b) => a.accountCode.localeCompare(b.accountCode)) };
    const existing = await this.prisma.accountingOpeningBalance.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { accountingEntry: { include: { lines: true } }, lines: true },
    });
    if (existing) return replayOpeningBalance(existing, fingerprint);

    try {
      return await this.audit.transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`opening-balance:${period}`}))`;
        const replay = await tx.accountingOpeningBalance.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { accountingEntry: { include: { lines: true } }, lines: true },
        });
        if (replay) return { result: replayOpeningBalance(replay, fingerprint), events: [] };
        const periodExisting = await tx.accountingOpeningBalance.findUnique({ where: { period }, select: { id: true, documentNumber: true } });
        if (periodExisting) throw new ConflictError('opening_balance_period_exists', `Opening balance за период ${period} уже создан`);

        const openingBalanceId = randomUUID();
        const occurredAt = periodBounds(period)[0];
        const entry = await postAccountingEntryOnTx(tx, {
          idempotencyKey: `accounting:opening-balance:${openingBalanceId}`,
          sourceType: 'finance.opening-balance',
          sourceRef: openingBalanceId,
          description,
          occurredAt,
          createdBy: actor,
          lines: lines.map((line) => ({ accountCode: line.accountCode, debit: line.debit, credit: line.credit, memo: line.memo })),
        });
        const document = await tx.accountingOpeningBalance.create({
          data: {
            id: openingBalanceId,
            period,
            documentNumber,
            idempotencyKey: dto.idempotencyKey,
            description,
            createdBy: actor,
            accountingEntryId: entry.id,
            lines: { create: lines },
          },
          include: { accountingEntry: { include: { lines: true } }, lines: { orderBy: { accountCode: 'asc' } } },
        });
        return {
          result: { ...document, idempotent: false },
          events: [
            { type: 'finance.opening_balance.created', actor, payload: { openingBalanceId, period, documentNumber, amount: debit, lineCount: lines.length, accountingEntryId: entry.id }, refs: [openingBalanceId, entry.id, period] },
            { type: EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: entry.id, sourceType: 'finance.opening-balance', sourceRef: openingBalanceId, amount: debit }, refs: [entry.id, openingBalanceId, period] },
          ],
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.accountingOpeningBalance.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { accountingEntry: { include: { lines: true } }, lines: true } });
        if (replay) return replayOpeningBalance(replay, fingerprint);
      }
      throw error;
    }
  }

  listCurrencyRates(query: CurrencyRateQueryDto) {
    const asOf = query.asOf ? new Date(query.asOf) : undefined;
    return this.prisma.accountingCurrencyRate.findMany({
      where: {
        ...(query.currency ? { currency: query.currency } : {}),
        ...(asOf ? { effectiveAt: { lte: asOf } } : {}),
      },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
      take: 365,
    });
  }

  async createCurrencyRate(dto: CreateCurrencyRateDto, actor: string) {
    const input = {
      currency: dto.currency.trim().toUpperCase(),
      baseCurrency: 'KGS',
      rateMicros: dto.rateMicros,
      effectiveAt: new Date(dto.effectiveAt),
      source: dto.source.trim(),
    };
    if (input.currency === input.baseCurrency) {
      throw new ValidationError('currency_rate_base_pair_invalid', 'Для KGS используется фиксированный курс 1.0 без отдельной записи');
    }
    const existing = await this.prisma.accountingCurrencyRate.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return replayCurrencyRate(existing, input);
    try {
      return await this.audit.transaction(async (tx) => {
        const rate = await tx.accountingCurrencyRate.create({
          data: { ...input, idempotencyKey: dto.idempotencyKey, createdBy: actor },
        });
        return {
          result: { ...rate, idempotent: false },
          events: [{
            type: EventType.FinanceCurrencyRateRecorded,
            actor,
            payload: { currencyRateId: rate.id, currency: rate.currency, baseCurrency: rate.baseCurrency, rateMicros: rate.rateMicros, effectiveAt: rate.effectiveAt, source: rate.source },
            refs: [rate.id],
          }],
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.accountingCurrencyRate.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (replay) return replayCurrencyRate(replay, input);
        throw new ConflictError('currency_rate_effective_at_conflict', 'Курс этой валюты на указанную дату уже зарегистрирован');
      }
      throw error;
    }
  }

  async fxExposure(query: FxExposureQueryDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new ValidationError('invalid_fx_exposure_as_of', 'Дата FX-отчёта некорректна');
    const currency = query.currency?.trim().toUpperCase();
    const point = normalizePoint(query.point);
    const expenses = await this.prisma.expense.findMany({
      where: {
        currency: currency ? currency : { not: 'KGS' },
        status: { in: [ExpenseStatus.submitted, ExpenseStatus.approved] },
        incurredAt: { lte: asOf },
        ...(point ? { point } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        exchangeRate: { select: { id: true, currency: true, baseCurrency: true, rateMicros: true, effectiveAt: true, source: true } },
      },
      orderBy: [{ currency: 'asc' }, { incurredAt: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
    const rates = await this.prisma.accountingCurrencyRate.findMany({
      where: { baseCurrency: 'KGS', effectiveAt: { lte: asOf }, ...(currency ? { currency } : {}) },
      orderBy: [{ currency: 'asc' }, { effectiveAt: 'desc' }, { createdAt: 'desc' }],
      take: 2_000,
    });
    const currentRates = new Map<string, (typeof rates)[number]>();
    for (const rate of rates) if (!currentRates.has(rate.currency)) currentRates.set(rate.currency, rate);

    const rows = expenses.map((expense) => {
      const currentRate = currentRates.get(expense.currency) ?? null;
      let currentBaseAmount: number | null = null;
      let valuationStatus: 'ready' | 'missing_rate' | 'overflow' = currentRate ? 'ready' : 'missing_rate';
      if (currentRate) {
        try {
          currentBaseAmount = expenseAccountingSnapshot({
            documentAmount: expense.documentAmount,
            exchangeRateMicros: currentRate.rateMicros,
            taxMode: expense.taxMode,
            taxRateBps: expense.taxRateBps,
          }).amount;
        } catch (error) {
          if (error instanceof ValidationError && error.code === 'expense_amount_overflow') {
            valuationStatus = 'overflow';
          } else {
            throw error;
          }
        }
      }
      return {
        id: expense.id,
        description: expense.description,
        status: expense.status,
        point: expense.point,
        supplier: expense.supplier,
        incurredAt: expense.incurredAt,
        currency: expense.currency,
        documentAmount: expense.documentAmount,
        originalRateMicros: expense.exchangeRateMicros,
        originalBaseAmount: expense.amount,
        currentRate: currentRate ? {
          id: currentRate.id,
          rateMicros: currentRate.rateMicros,
          effectiveAt: currentRate.effectiveAt,
          source: currentRate.source,
        } : null,
        currentBaseAmount,
        valuationDelta: currentBaseAmount === null ? null : currentBaseAmount - expense.amount,
        valuationStatus,
      };
    });
    const totals = new Map<string, { documentAmount: number; originalBaseAmount: number; currentBaseAmount: number; valuationDelta: number; openDocuments: number; missingRateDocuments: number; overflowDocuments: number }>();
    for (const row of rows) {
      const total = totals.get(row.currency) ?? { documentAmount: 0, originalBaseAmount: 0, currentBaseAmount: 0, valuationDelta: 0, openDocuments: 0, missingRateDocuments: 0, overflowDocuments: 0 };
      total.documentAmount += row.documentAmount;
      total.originalBaseAmount += row.originalBaseAmount;
      total.currentBaseAmount += row.currentBaseAmount ?? 0;
      total.valuationDelta += row.valuationDelta ?? 0;
      total.openDocuments += 1;
      if (row.valuationStatus === 'missing_rate') total.missingRateDocuments += 1;
      if (row.valuationStatus === 'overflow') total.overflowDocuments += 1;
      totals.set(row.currency, total);
    }
    return {
      asOf,
      baseCurrency: 'KGS',
      reportType: 'open_foreign_expense_documents',
      rows,
      totals: [...totals.entries()].map(([rowCurrency, total]) => ({ currency: rowCurrency, ...total })),
      coverage: {
        complete: true,
        statuses: [ExpenseStatus.submitted, ExpenseStatus.approved],
        limit: 500,
        truncated: expenses.length === 500,
        note: 'Показываются только незакрытые иностранные расходы. Разница является расчётной и не признаётся прибылью или убытком без отдельной утверждённой переоценки.',
      },
    };
  }

  listBankStatements(accountCode?: string) {
    return this.prisma.bankStatement.findMany({
      where: accountCode?.trim() ? { accountCode: accountCode.trim() } : undefined,
      include: { lines: { orderBy: { occurredAt: 'asc' } } },
      orderBy: { periodStart: 'desc' },
      take: 120,
    });
  }

  listCashIncassations(point?: string) {
    return this.prisma.cashIncassation.findMany({
      where: point?.trim() ? { point: point.trim() } : undefined,
      include: {
        shift: { select: { id: true, staffId: true, point: true, closeCash: true, closedAt: true } },
        accountingEntry: { select: { id: true, sourceType: true, sourceRef: true, occurredAt: true } },
      },
      orderBy: { depositedAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Closed shifts that still hold uncollected cash. Without this the owner has
   * no way to find a shift id to collect against, and the ERP «К инкассации»
   * tile had no number to show.
   */
  async collectableShifts(point?: string) {
    const shifts = await this.prisma.cashShift.findMany({
      where: { closedAt: { not: null }, ...(point ? { point } : {}) },
      include: { incassations: { select: { amount: true } } },
      orderBy: { closedAt: 'desc' },
      take: 50,
    });
    return shifts
      .map((shift) => {
        const deposited = shift.incassations.reduce((sum, item) => sum + item.amount, 0);
        return {
          id: shift.id,
          point: shift.point,
          closedAt: shift.closedAt,
          closeCash: shift.closeCash ?? 0,
          deposited,
          available: (shift.closeCash ?? 0) - deposited,
        };
      })
      .filter((shift) => shift.available > 0);
  }

  async createCashIncassation(shiftId: string, dto: CreateCashIncassationDto, actor: string, idempotencyKey: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cash-incassation:${shiftId}`}))::text`;
      const destinationCode = dto.destinationCode?.trim() || DEFAULT_INCASSATION_DESTINATION;
      const destinationSpec = INCASSATION_DESTINATIONS[destinationCode];
      if (!destinationSpec) throw new ValidationError('cash_incassation_destination_invalid', `Счет ${destinationCode} не разрешен для инкассации`);
      const existing = await tx.cashIncassation.findUnique({ where: { idempotencyKey }, include: { accountingEntry: true } });
      if (existing) {
        if (existing.shiftId !== shiftId || existing.amount !== dto.amount || existing.destinationCode !== destinationCode) throw new ConflictError('cash_incassation_idempotency_mismatch', 'Ключ инкассации уже использован для другой суммы, смены или назначения');
        return { result: { ...existing, idempotent: true }, events: [] };
      }
      const shift = await tx.cashShift.findUnique({ where: { id: shiftId }, include: { incassations: { select: { amount: true } } } });
      if (!shift) throw new ValidationError('shift_not_found', `Смена ${shiftId} не найдена`);
      if (!shift.closedAt || shift.closeCash === null) throw new ConflictError('shift_must_be_closed', 'Инкассация доступна только после закрытия и пересчета смены');
      const alreadyDeposited = shift.incassations.reduce((sum, item) => sum + item.amount, 0);
      const available = shift.closeCash - alreadyDeposited;
      if (dto.amount > available) throw new ConflictError('cash_incassation_exceeds_drawer', `Инкассация ${dto.amount} сом превышает доступный остаток кассы ${available} сом`);
      const destination = await tx.accountingAccount.findUnique({ where: { code: destinationCode }, select: { code: true, active: true, type: true } });
      if (!destination?.active || destination.type !== destinationSpec.type) throw new ValidationError('cash_incassation_destination_invalid', `Счет назначения ${destinationCode} не настроен`);
      const depositedAt = new Date();
      const incassation = await tx.cashIncassation.create({
        data: { idempotencyKey, shiftId, point: shift.point, amount: dto.amount, destinationCode, reference: dto.reference?.trim() || null, depositedBy: actor, depositedAt },
      });
      const entry = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:cash-incassation:${idempotencyKey}`,
        sourceType: 'cash.incassation',
        sourceRef: incassation.id,
        description: `${destinationSpec.label} кассы ${shift.point} · смена ${shift.id}`,
        point: shift.point,
        occurredAt: depositedAt,
        createdBy: actor,
        lines: [
          { accountCode: destinationCode, debit: dto.amount, memo: destinationSpec.memo },
          { accountCode: '1000', credit: dto.amount, memo: 'Выбытие наличных из кассы' },
        ],
      });
      const linked = await tx.cashIncassation.update({ where: { id: incassation.id }, data: { accountingEntryId: entry.id }, include: { accountingEntry: true } });
      return {
        result: { ...linked, idempotent: false },
        events: [{ type: 'finance.cash_incassation.deposited', actor, payload: { incassationId: linked.id, shiftId, point: shift.point, amount: dto.amount, destinationCode, accountingEntryId: entry.id }, refs: [linked.id, shiftId, entry.id] }],
      };
    });
  }

  async importBankStatement(dto: ImportBankStatementDto, actor: string) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodStart >= periodEnd) {
      throw new ValidationError('invalid_bank_statement_period', 'Период банковской выписки некорректен');
    }
    if (dto.lines.some((line) => line.amount === 0) || new Set(dto.lines.map((line) => line.externalId.trim())).size !== dto.lines.length) {
      throw new ValidationError('invalid_bank_statement_lines', 'Строки выписки должны иметь уникальный внешний ID и ненулевую сумму');
    }
    const movement = dto.lines.reduce((sum, line) => sum + line.amount, 0);
    if (dto.openingBalance + movement !== dto.closingBalance) {
      throw new ConflictError('bank_statement_balance_mismatch', 'Начальный баланс плюс движения не равен конечному балансу');
    }
    const existing = await this.prisma.bankStatement.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { lines: true } });
    if (existing) {
      if (existing.statementNumber !== dto.statementNumber.trim() || existing.closingBalance !== dto.closingBalance) throw new ConflictError('bank_statement_idempotency_conflict', 'Ключ выписки уже использован для других данных');
      return { ...existing, idempotent: true };
    }
    return this.audit.transaction(async (tx) => {
      const account = await tx.accountingAccount.findUnique({ where: { code: dto.accountCode.trim() } });
      if (!account || account.type !== 'asset' || !account.active) throw new ValidationError('bank_statement_account_invalid', 'Счёт выписки должен быть активным счётом актива');
      const statement = await tx.bankStatement.create({
        data: {
          accountCode: account.code,
          statementNumber: dto.statementNumber.trim(),
          idempotencyKey: dto.idempotencyKey,
          periodStart,
          periodEnd,
          openingBalance: dto.openingBalance,
          closingBalance: dto.closingBalance,
          createdBy: actor,
          lines: { create: dto.lines.map((line) => ({ externalId: line.externalId.trim(), occurredAt: new Date(line.occurredAt), amount: line.amount, reference: line.reference?.trim() || null })) },
        },
        include: { lines: true },
      });
      return { result: statement, events: [{ type: 'finance.bank_statement.imported', actor, payload: { statementId: statement.id, accountCode: account.code, lineCount: statement.lines.length, closingBalance: statement.closingBalance }, refs: [statement.id, account.code] }] };
    });
  }

  async reconcileBankStatementLine(id: string, dto: ReconcileBankStatementLineDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BankStatementLine" WHERE id = ${id} FOR UPDATE`;
      const line = await tx.bankStatementLine.findUnique({ where: { id }, include: { statement: true } });
      if (!line) throw new ValidationError('bank_statement_line_not_found', `Строка выписки ${id} не найдена`);
      if (line.reconciliationKey === dto.idempotencyKey) return { result: { ...line, idempotent: true }, events: [] };
      if (line.status === 'matched') throw new ConflictError('bank_statement_line_matched', 'Строка уже сверена другим ключом');
      const entry = await tx.accountingJournalEntry.findUnique({ where: { id: dto.journalEntryId }, include: { lines: true } });
      if (!entry) throw new ValidationError('accounting_entry_not_found', `Проводка ${dto.journalEntryId} не найдена`);
      if (entry.occurredAt < line.statement.periodStart || entry.occurredAt >= line.statement.periodEnd) throw new ConflictError('bank_statement_entry_outside_period', 'Проводка находится вне периода выписки');
      const movement = entry.lines.filter((current) => current.accountCode === line.statement.accountCode).reduce((sum, current) => sum + current.debit - current.credit, 0);
      if (movement !== line.amount) throw new ConflictError('bank_statement_amount_mismatch', 'Сумма строки не совпадает с движением по банковскому счёту в проводке');
      const duplicate = await tx.bankStatementLine.findUnique({ where: { matchedEntryId: entry.id }, select: { id: true } });
      if (duplicate && duplicate.id !== id) throw new ConflictError('accounting_entry_already_reconciled', 'Проводка уже связана с другой строкой выписки');
      const matched = await tx.bankStatementLine.update({ where: { id }, data: { status: 'matched', reconciliationKey: dto.idempotencyKey, matchedEntryId: entry.id, matchedBy: actor, matchedAt: new Date() } });
      if (entry.sourceType === 'cash.incassation') {
        await tx.cashIncassation.updateMany({ where: { accountingEntryId: entry.id, status: 'deposited' }, data: { status: 'reconciled', reconciledAt: new Date() } });
      }
      const remaining = await tx.bankStatementLine.count({ where: { statementId: line.statementId, status: { not: 'matched' } } });
      const statement = await tx.bankStatement.update({ where: { id: line.statementId }, data: { status: remaining === 0 ? 'reconciled' : 'imported' } });
      return { result: { ...matched, statement, statementStatus: statement.status, idempotent: false }, events: [{ type: 'finance.bank_statement_line_reconciled', actor, payload: { lineId: id, statementId: line.statementId, journalEntryId: entry.id, amount: line.amount }, refs: [id, line.statementId, entry.id] }] };
    });
  }

  async closeAccountingPeriod(rawPeriod: string, dto: CloseAccountingPeriodDto, actor: string) {
    const period = validateMonth(rawPeriod);
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`accounting-period:${period}`}))`;
      const commandKey = `accounting-period:${period}:${dto.idempotencyKey}`;
      const existing = await tx.accountingPeriod.findUnique({ where: { period } });
      if (existing?.lastCloseIdempotencyKey === commandKey || existing?.status === 'hard_closed') {
        return { result: { ...existing, idempotent: true }, events: [] };
      }
      if ((!existing || existing.status === 'open') && dto.status !== 'soft_closed') {
        throw new ConflictError('accounting_period_soft_close_required', 'Сначала выполните мягкое закрытие периода');
      }
      if (existing?.status === 'soft_closed' && dto.status === 'soft_closed') {
        return { result: { ...existing, idempotent: true }, events: [] };
      }
      if (dto.status === 'hard_closed') {
        const readiness = await accountingPeriodReadinessOnTx(tx, period);
        if (!readiness.ready) {
          const first = readiness.blockers[0];
          throw new ConflictError(first.code, first.message);
        }
        const taxSettlement = await tx.accountingTaxSettlement.findUnique({
          where: { period_point: { period, point: '' } },
        });
        if (!taxSettlement) {
          throw new ConflictError('tax_period_settlement_required', 'Перед закрытием периода зафиксируйте итоговую налоговую сверку по всем точкам');
        }
        const currentTax = await taxPeriodOnTx(tx, period, '');
        if (taxSettlement.outputTax !== currentTax.outputTax
          || taxSettlement.inputTax !== currentTax.inputTax
          || taxSettlement.offsetAmount !== currentTax.offsetAmount
          || taxSettlement.payableAmount !== currentTax.payableAmount
          || taxSettlement.recoverableAmount !== currentTax.recoverableAmount) {
          throw new ConflictError('tax_period_settlement_stale', 'Налоговые движения изменились после сверки; период нельзя закрыть');
        }
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

  async taxPeriod(rawPeriod: string, rawPoint?: string) {
    const period = validateMonth(rawPeriod);
    const point = normalizePoint(rawPoint);
    return this.prisma.$transaction((tx) => taxPeriodOnTx(tx, period, point));
  }

  async settleTaxPeriod(rawPeriod: string, dto: SettleTaxPeriodDto, actor: string) {
    const period = validateMonth(rawPeriod);
    if (normalizePoint(dto.point)) {
      throw new ValidationError('tax_settlement_global_only', 'Фиксация НДС выполняется по всем точкам; точка доступна только как аналитический фильтр');
    }
    const point = '';
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`tax-period:${period}:${point}`}))::text AS locked`;
      const replay = await tx.accountingTaxSettlement.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { accountingEntry: true },
      });
      if (replay) {
        if (replay.period !== period || replay.point !== point) {
          throw new ConflictError('idempotency_key_reused', 'Ключ налоговой сверки уже использован для другого периода или точки');
        }
        const report = await taxPeriodOnTx(tx, period, point);
        return { result: { ...report, settlement: replay, idempotent: true }, events: [] };
      }
      const duplicate = await tx.accountingTaxSettlement.findUnique({
        where: { period_point: { period, point } },
        include: { accountingEntry: true },
      });
      if (duplicate) {
        throw new ConflictError('tax_period_already_settled', 'Налоговая сверка этого периода и точки уже зафиксирована');
      }
      const accountingPeriod = await tx.accountingPeriod.findUnique({ where: { period } });
      if (accountingPeriod?.status !== 'soft_closed') {
        throw new ConflictError('tax_period_soft_close_required', 'Налоговая сверка доступна только после мягкого закрытия периода');
      }
      const report = await taxPeriodOnTx(tx, period, point);
      const settlement = await tx.accountingTaxSettlement.create({
        data: {
          period,
          point,
          idempotencyKey: dto.idempotencyKey,
          outputTax: report.outputTax,
          inputTax: report.inputTax,
          offsetAmount: report.offsetAmount,
          payableAmount: report.payableAmount,
          recoverableAmount: report.recoverableAmount,
          createdBy: actor,
        },
      });
      let accountingEntry = null;
      if (report.offsetAmount > 0) {
        const [, to] = periodBounds(period);
        accountingEntry = await postAccountingEntryOnTx(tx, {
          idempotencyKey: `accounting:tax-settlement:${dto.idempotencyKey}`,
          sourceType: 'tax.settlement',
          sourceRef: settlement.id,
          description: `Взаимозачёт входящего и исходящего НДС за ${period}${point ? ` · ${point}` : ''}`,
          point: point || null,
          documentAmount: report.offsetAmount,
          baseAmount: report.offsetAmount,
          taxCode: 'vat_offset',
          taxAmount: report.offsetAmount,
          occurredAt: new Date(to.getTime() - 1),
          createdBy: actor,
          lines: [
            { accountCode: '2200', debit: report.offsetAmount, memo: 'Погашение исходящего НДС' },
            { accountCode: '1210', credit: report.offsetAmount, memo: 'Зачёт входящего НДС' },
          ],
        });
        await tx.accountingTaxSettlement.update({
          where: { id: settlement.id },
          data: { accountingEntryId: accountingEntry.id },
        });
      }
      const persisted = await tx.accountingTaxSettlement.findUniqueOrThrow({
        where: { id: settlement.id },
        include: { accountingEntry: true },
      });
      return {
        result: { ...report, settlement: persisted, idempotent: false },
        events: [
          {
            type: 'finance.tax_period_settled',
            actor,
            payload: { period, point: point || null, outputTax: report.outputTax, inputTax: report.inputTax, offsetAmount: report.offsetAmount, payableAmount: report.payableAmount, recoverableAmount: report.recoverableAmount, accountingEntryId: accountingEntry?.id ?? null },
            refs: [persisted.id, ...(accountingEntry ? [accountingEntry.id] : [])],
          },
          ...(accountingEntry ? [{
            type: EventType.AccountingEntryPosted,
            actor,
            payload: { accountingEntryId: accountingEntry.id, sourceType: 'tax.settlement', sourceRef: settlement.id },
            refs: [accountingEntry.id, settlement.id],
          }] : []),
        ],
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
    const reportLimit = 500;
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new ValidationError('invalid_ap_as_of', 'Дата AP aging некорректна');
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: {
        status: { in: ['approved', 'partially_paid', 'paid'] },
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        createdAt: { lte: asOf },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, number: true } },
        accountingEntry: { select: { id: true, sourceType: true, sourceRef: true } },
        creditNotes: { where: { status: 'applied', appliedAt: { lte: asOf } }, select: { id: true, noteNumber: true, amount: true, accountingEntryId: true, appliedAt: true } },
        payments: { where: { paidAt: { lte: asOf } }, select: { id: true, amount: true, paymentAccountCode: true, paymentReference: true, paidAt: true, accountingEntryId: true } },
        advanceAllocations: { where: { appliedAt: { lte: asOf } }, select: { id: true, amount: true, appliedAt: true, accountingEntryId: true, advance: { select: { id: true, paymentReference: true } } } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: reportLimit,
    });
    const rows = invoices.map((invoice) => {
      const creditApplied = invoice.creditNotes.reduce((sum, note) => sum + note.amount, 0);
      const paidAmount = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const advanceApplied = invoice.advanceAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      const outstanding = Math.max(0, invoice.amount - paidAmount - creditApplied - advanceApplied);
      const creditReceivable = Math.max(0, paidAmount + creditApplied + advanceApplied - invoice.amount);
      const dueDate = invoice.dueDate ?? invoice.createdAt;
      const ageDays = Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000));
      const bucket = outstanding === 0 ? 'paid' : ageDays === 0 ? 'current' : ageDays <= 30 ? '1_30' : ageDays <= 60 ? '31_60' : ageDays <= 90 ? '61_90' : '90_plus';
      return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier, purchaseOrder: invoice.purchaseOrder, amount: invoice.amount, paidAmount, creditApplied, advanceApplied, creditReceivable, outstanding, dueDate, ageDays, bucket, status: invoice.status, accountingEntry: invoice.accountingEntry, payments: invoice.payments, creditNotes: invoice.creditNotes, advanceAllocations: invoice.advanceAllocations };
    });
    const buckets = ['current', '1_30', '31_60', '61_90', '90_plus', 'paid'] as const;
    const totals = Object.fromEntries(buckets.map((bucket) => [bucket, rows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.amount, 0)]));
    return { asOf, rows, totals, totalOutstanding: rows.reduce((sum, row) => sum + row.outstanding, 0), totalCreditReceivable: rows.reduce((sum, row) => sum + row.creditReceivable, 0), totalCreditApplied: rows.reduce((sum, row) => sum + row.creditApplied, 0), totalAdvanceApplied: rows.reduce((sum, row) => sum + row.advanceApplied, 0), supplierCount: new Set(rows.map((row) => row.supplier.id)).size, truncated: rows.length === reportLimit };
  }

  async customerAging(query: ArAgingQueryDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new ValidationError('invalid_ar_as_of', 'Дата AR aging некорректна');

    const debts = await this.prisma.debtPlan.findMany({
      where: {
        createdAt: { lte: asOf },
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      include: {
        accountingEntry: {
          select: {
            id: true,
            sourceType: true,
            sourceRef: true,
            description: true,
            documentAmount: true,
            taxAmount: true,
            occurredAt: true,
            postedAt: true,
            createdBy: true,
            lines: { select: { accountCode: true, debit: true, credit: true, memo: true }, orderBy: { accountCode: 'asc' } },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });

    const orderIds = debts.map((debt) => debt.orderId);
    const customerIds = [...new Set(debts.map((debt) => debt.customerId))];
    const [customers, orders] = await Promise.all([
      customerIds.length === 0
        ? []
        : this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } }),
      orderIds.length === 0
        ? []
        : this.prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, channel: true, total: true, status: true, createdAt: true } }),
    ]);
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const payments = orderIds.length === 0
      ? []
      : await this.prisma.payment.findMany({
        where: {
          orderId: { in: orderIds },
          method: 'installment',
          amount: { gt: 0 },
          status: { in: ['received', 'reconciled'] },
        },
        select: {
          id: true,
          orderId: true,
          amount: true,
          status: true,
          createdAt: true,
          receivedBy: true,
          point: true,
          txnId: true,
          accountingEntry: {
            select: {
              id: true,
              sourceType: true,
              sourceRef: true,
              description: true,
              occurredAt: true,
              postedAt: true,
              lines: { select: { accountCode: true, debit: true, credit: true, memo: true }, orderBy: { accountCode: 'asc' } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    const paymentsByOrder = new Map<string, typeof payments>();
    for (const payment of payments) {
      const orderPayments = paymentsByOrder.get(payment.orderId ?? '') ?? [];
      orderPayments.push(payment);
      paymentsByOrder.set(payment.orderId ?? '', orderPayments);
    }

    const rows = debts.map((debt) => {
      const orderPayments = paymentsByOrder.get(debt.orderId) ?? [];
      const paymentsAtAsOf = orderPayments.filter((payment) => payment.createdAt <= asOf);
      const paymentsAfterAsOf = orderPayments.filter((payment) => payment.createdAt > asOf);
      // DebtPlan.balance is the authoritative current snapshot. Adding only
      // later payments reconstructs an earlier balance without trusting a
      // client-provided amount or duplicating the debt ledger.
      const historicalBalance = Math.min(
        debt.principal,
        Math.max(0, debt.balance + paymentsAfterAsOf.reduce((sum, payment) => sum + payment.amount, 0)),
      );
      const outstanding = historicalBalance;
      const paidAmount = debt.principal - outstanding;
      const dueDate = debt.dueDate;
      const ageDays = Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000));
      const bucket = outstanding === 0
        ? 'paid'
        : ageDays === 0
          ? 'current'
          : ageDays <= 30
            ? '1_30'
            : ageDays <= 60
              ? '31_60'
              : ageDays <= 90
                ? '61_90'
                : '90_plus';
      return {
        id: debt.id,
        customer: customerById.get(debt.customerId) ?? { id: debt.customerId, name: 'Удалённый клиент' },
        order: orderById.get(debt.orderId) ?? { id: debt.orderId, channel: 'unknown', total: debt.principal, status: 'unknown', createdAt: debt.createdAt },
        principal: debt.principal,
        balance: outstanding,
        outstanding,
        currentBalance: debt.balance,
        paidAmount,
        installments: debt.installments,
        dueDate,
        ageDays,
        bucket,
        status: outstanding === 0 ? 'settled' : 'open',
        accountingEntry: debt.accountingEntry,
        payments: paymentsAtAsOf,
      };
    }).filter((row) => !query.status || row.status === query.status);

    const buckets = ['current', '1_30', '31_60', '61_90', '90_plus', 'paid'] as const;
    const totals = Object.fromEntries(
      buckets.map((bucket) => [bucket, rows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.outstanding, 0)]),
    );
    return {
      asOf,
      rows,
      totals,
      totalPrincipal: rows.reduce((sum, row) => sum + row.principal, 0),
      totalPaid: rows.reduce((sum, row) => sum + row.paidAmount, 0),
      totalOutstanding: rows.reduce((sum, row) => sum + row.outstanding, 0),
      customerCount: new Set(rows.map((row) => row.customer.id)).size,
    };
  }

  async customerDebtDrilldown(id: string, query: ArAgingQueryDto) {
    const report = await this.customerAging({ ...query, status: undefined });
    const row = report.rows.find((candidate) => candidate.id === id);
    if (!row) throw new ValidationError('ar_document_not_found', `Долг ${id} не найден на выбранную дату`);
    return { asOf: report.asOf, ...row };
  }

  async accountingJournalExport(query: FinanceAccountingQueryDto) {
    const entries = await this.accountingJournal(query);
    const headers = ['entry_id', 'source_type', 'source_ref', 'description', 'point', 'currency', 'document_amount', 'tax_amount', 'occurred_at', 'posted_at', 'created_by', 'account_code', 'account_name', 'debit', 'credit', 'memo'];
    const rows = entries.flatMap((entry) => entry.lines.map((line) => [
      entry.id,
      entry.sourceType,
      entry.sourceRef,
      entry.description,
      entry.point,
      entry.currency,
      entry.documentAmount,
      entry.taxAmount,
      entry.occurredAt,
      entry.postedAt,
      entry.createdBy,
      line.accountCode,
      line.account.name,
      line.debit,
      line.credit,
      line.memo,
    ]));
    return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  async listManualAdjustments(status?: string) {
    const allowed = ['requested', 'approved', 'rejected'];
    if (status && !allowed.includes(status)) {
      throw new ValidationError('invalid_manual_adjustment_status', `Неизвестный статус ручной корректировки: ${status}`);
    }
    const approvals = await this.prisma.approval.findMany({
      where: { action: 'manual_adjustment', ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const sourceRefs = approvals.map((approval) => approval.sourceRef).filter((value): value is string => Boolean(value));
    const entries = await this.prisma.accountingJournalEntry.findMany({
      where: { sourceType: 'finance.manual_adjustment', sourceRef: { in: sourceRefs } },
      include: { lines: { include: { account: true }, orderBy: { accountCode: 'asc' } } },
    });
    const bySourceRef = new Map(entries.map((entry) => [entry.sourceRef, entry]));
    return approvals.map((approval) => ({
      id: approval.id,
      approvalId: approval.id,
      action: approval.action,
      requester: approval.requester,
      approver: approval.approver,
      status: approval.status,
      reason: approval.reason,
      idempotencyKey: approval.idempotencyKey,
      sourceRef: approval.sourceRef,
      createdAt: approval.createdAt,
      snapshot: (approval.evidence as { payload?: unknown } | null)?.payload ?? null,
      accountingEntry: approval.sourceRef ? bySourceRef.get(approval.sourceRef) ?? null : null,
    }));
  }

  async createManualAdjustment(dto: CreateManualAdjustmentDto, actor: string) {
    const description = dto.description.trim();
    const documentNumber = dto.documentNumber.trim();
    const point = dto.point?.trim() || null;
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new ValidationError('manual_adjustment_date_invalid', 'Дата корректировки некорректна');
    const lines = dto.lines.map((line) => ({
      accountCode: line.accountCode.trim(),
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
      memo: line.memo?.trim() || null,
    }));
    const debit = lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = lines.reduce((sum, line) => sum + line.credit, 0);
    if (lines.length < 2 || debit <= 0 || debit !== credit || lines.some((line) => (line.debit > 0) === (line.credit > 0))) {
      throw new ValidationError('manual_adjustment_unbalanced', 'Ручная корректировка должна содержать сбалансированные строки');
    }
    const payload = { documentNumber, description, point, occurredAt: occurredAt.toISOString(), amount: debit, lines };
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`manual-adjustment-key:${dto.idempotencyKey}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`manual-adjustment-document:${documentNumber}`}))`;
      const existing = await tx.approval.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) {
        const existingPayload = (existing.evidence as { payload?: unknown } | null)?.payload;
        if (existing.action !== 'manual_adjustment' || stableJson(existingPayload) !== stableJson(payload)) {
          throw new ConflictError('manual_adjustment_idempotency_conflict', 'Idempotency key уже использован для другой корректировки');
        }
        return { result: { approvalId: existing.id, status: existing.status, idempotent: true, snapshot: existingPayload }, events: [] };
      }
      const sameDocument = await tx.approval.findUnique({ where: { sourceRef: documentNumber } });
      if (sameDocument) throw new ConflictError('manual_adjustment_document_exists', 'Первичный документ корректировки уже зарегистрирован');
      const approval = await tx.approval.create({
        data: {
          action: 'manual_adjustment',
          requester: actor,
          reason: description,
          idempotencyKey: dto.idempotencyKey,
          sourceRef: documentNumber,
          status: 'requested',
          evidence: { payload, evidence: { documentNumber, amount: debit } } as Prisma.InputJsonValue,
        },
      });
      return {
        result: { approvalId: approval.id, status: approval.status, idempotent: false, snapshot: payload },
        events: [{ type: EventType.FinanceManualAdjustmentRequested, actor, payload: { approvalId: approval.id, documentNumber, amount: debit }, refs: [approval.id, documentNumber] }],
      };
    });
  }

  async reverseAccountingEntry(id: string, dto: ReverseAccountingEntryDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "AccountingJournalEntry" WHERE id = ${id} FOR UPDATE`;
      const original = await tx.accountingJournalEntry.findUnique({ where: { id }, include: { lines: true } });
      if (!original) throw new ValidationError('accounting_entry_not_found', `Проводка ${id} не найдена`);
      if (original.reversalOfId) throw new ConflictError('accounting_reversal_of_reversal', 'Нельзя сторнировать уже обратную проводку');
      const existingReversal = await tx.accountingJournalEntry.findUnique({ where: { reversalOfId: id }, include: { lines: true } });
      if (existingReversal) return { result: { ...existingReversal, idempotent: true }, events: [] };
      const reversal = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:reversal:${id}:${dto.idempotencyKey}`,
        sourceType: 'accounting.reversal',
        sourceRef: `${id}:${dto.idempotencyKey}`,
        description: `Сторно проводки ${id}: ${dto.reason.trim()}`,
        point: original.point,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        createdBy: actor,
        lines: original.lines.map((line) => ({ accountCode: line.accountCode, debit: line.credit, credit: line.debit, memo: `Сторно: ${line.memo ?? original.description}` })),
      });
      const linked = await tx.accountingJournalEntry.update({ where: { id: reversal.id }, data: { reversalOfId: id }, include: { lines: true } });
      return { result: { ...linked, idempotent: false }, events: [{ type: 'finance.accounting_entry_reversed', actor, payload: { originalEntryId: id, reversalEntryId: linked.id, reason: dto.reason.trim() }, refs: [id, linked.id] }] };
    });
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

  async financialStatements(query: FinanceAccountingQueryDto) {
    const period = accountingPeriod(query);
    const point = normalizePoint(query.point);
    const where = {
      occurredAt: { gte: period.from, lt: period.to },
      ...(point ? { point } : {}),
    } satisfies Prisma.AccountingJournalEntryWhereInput;
    const [accounts, entries] = await Promise.all([
      this.prisma.accountingAccount.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      this.prisma.accountingJournalEntry.findMany({ where, include: { lines: true }, orderBy: { occurredAt: 'asc' } }),
    ]);
    const totals = new Map(accounts.map((account) => [account.code, { debit: 0, credit: 0, name: account.name, type: account.type }]));
    for (const entry of entries) for (const line of entry.lines) {
      const total = totals.get(line.accountCode);
      if (total) { total.debit += line.debit; total.credit += line.credit; }
    }
    const rows = [...totals.entries()].map(([code, value]) => ({ code, ...value, balance: normalBalance(value.type, value.debit, value.credit) }));
    const revenue = rows.filter((row) => row.type === 'revenue').reduce((sum, row) => sum + row.balance, 0);
    const expenses = rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.balance, 0);
    const netProfit = revenue - expenses;
    const assets = rows.filter((row) => row.type === 'asset').reduce((sum, row) => sum + row.balance, 0);
    const liabilities = rows.filter((row) => row.type === 'liability').reduce((sum, row) => sum + row.balance, 0);
    const equity = rows.filter((row) => row.type === 'equity').reduce((sum, row) => sum + row.balance, 0);
    const cashCodes = new Set(['1000', '1010', '1020']);
    const cash = rows.filter((row) => cashCodes.has(row.code)).reduce((sum, row) => sum + row.balance, 0);
    const journalDebit = entries.reduce((sum, entry) => sum + entry.lines.reduce((total, line) => total + line.debit, 0), 0);
    const journalCredit = entries.reduce((sum, entry) => sum + entry.lines.reduce((total, line) => total + line.credit, 0), 0);
    return {
      from: period.from,
      to: period.to,
      point: point || null,
      source: 'accounting_journal',
      entries: entries.length,
      balanced: journalDebit === journalCredit,
      journal: { debit: journalDebit, credit: journalCredit },
      profitAndLoss: { revenue, expenses, netProfit, rows: rows.filter((row) => row.type === 'revenue' || row.type === 'expense') },
      balanceSheet: { assets, liabilities, equity, currentPeriodProfit: netProfit, liabilitiesAndEquity: liabilities + equity + netProfit, balanced: assets === liabilities + equity + netProfit, rows: rows.filter((row) => row.type === 'asset' || row.type === 'liability' || row.type === 'equity') },
      cashFlow: { cashMovement: cash, rows: rows.filter((row) => cashCodes.has(row.code)) },
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
    const input = await normalizedExpense(this.prisma, dto);
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
        currency: expense.currency,
        documentAmount: expense.documentAmount,
        exchangeRateMicros: expense.exchangeRateMicros,
        baseAmount: expense.amount,
        taxCode: expense.taxCode,
        taxRateBps: expense.taxRateBps,
        taxAmount: expense.taxAmount,
        occurredAt: paidAt,
        createdBy: actor,
        lines: [
          { accountCode: expenseAccountCode(expense.category), debit: expense.taxBaseAmount, memo: expense.description },
          ...(expense.taxAmount > 0 ? [{ accountCode: '1210', debit: expense.taxAmount, memo: `${expense.taxCode} ${expense.taxRateBps} bps` }] : []),
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
            payload: { expenseId: id, amount: paid.amount, documentAmount: paid.documentAmount, currency: paid.currency, exchangeRateMicros: paid.exchangeRateMicros, taxBaseAmount: paid.taxBaseAmount, taxAmount: paid.taxAmount, taxRateBps: paid.taxRateBps, category: paid.category, fundingAccountCode: dto.fundingAccountCode, paymentReference: paid.paymentReference, accountingEntryId: entry.id },
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

async function taxPeriodOnTx(tx: Prisma.TransactionClient, period: string, point: string) {
  const [from, to] = periodBounds(period);
  const entryFilter: Prisma.AccountingJournalEntryWhereInput = {
    occurredAt: { gte: from, lt: to },
    sourceType: { not: 'tax.settlement' },
    ...(point ? { point } : {}),
  };
  const [output, input, accountingPeriod, settlement] = await Promise.all([
    tx.accountingJournalLine.aggregate({
      where: { accountCode: '2200', entry: entryFilter },
      _sum: { debit: true, credit: true },
    }),
    tx.accountingJournalLine.aggregate({
      where: { accountCode: '1210', entry: entryFilter },
      _sum: { debit: true, credit: true },
    }),
    tx.accountingPeriod.findUnique({ where: { period } }),
    tx.accountingTaxSettlement.findUnique({
      where: { period_point: { period, point } },
      include: { accountingEntry: true },
    }),
  ]);
  const outputNet = (output._sum.credit ?? 0) - (output._sum.debit ?? 0);
  const inputNet = (input._sum.debit ?? 0) - (input._sum.credit ?? 0);
  const outputTax = Math.max(0, outputNet) + Math.max(0, -inputNet);
  const inputTax = Math.max(0, inputNet) + Math.max(0, -outputNet);
  const offsetAmount = Math.min(outputTax, inputTax);
  return {
    period,
    point: point || null,
    from,
    to,
    status: accountingPeriod?.status ?? 'open',
    outputTax,
    inputTax,
    outputNet,
    inputNet,
    offsetAmount,
    payableAmount: Math.max(0, outputTax - inputTax),
    recoverableAmount: Math.max(0, inputTax - outputTax),
    settlement,
  };
}

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

async function normalizedExpense(prisma: PrismaService, dto: CreateExpenseDto) {
  const currency = (dto.currency ?? 'KGS').trim().toUpperCase();
  const incurredAt = dto.incurredAt ? new Date(dto.incurredAt) : undefined;
  const rateDate = incurredAt ?? new Date();
  let exchangeRateId: string | null = null;
  let exchangeRateMicros = 1_000_000;
  if (currency === 'KGS') {
    if (dto.exchangeRateId) throw new ValidationError('expense_exchange_rate_not_allowed', 'Для расхода в KGS отдельный курс не требуется');
  } else {
    if (!dto.exchangeRateId) throw new ValidationError('expense_exchange_rate_required', `Для валюты ${currency} требуется зарегистрированный курс`);
    const rate = await prisma.accountingCurrencyRate.findUnique({ where: { id: dto.exchangeRateId } });
    if (!rate || rate.currency !== currency || rate.baseCurrency !== 'KGS') {
      throw new ValidationError('expense_exchange_rate_mismatch', 'Курс не соответствует валюте документа и базовой валюте KGS');
    }
    if (rate.effectiveAt.getTime() > rateDate.getTime()) {
      throw new ValidationError('expense_exchange_rate_future', 'Нельзя использовать курс, который вступает в силу после даты расхода');
    }
    exchangeRateId = rate.id;
    exchangeRateMicros = rate.rateMicros;
  }
  const taxMode = dto.taxMode ?? 'none';
  const taxRateBps = dto.taxRateBps ?? 0;
  const snapshot = expenseAccountingSnapshot({
    documentAmount: dto.amount,
    exchangeRateMicros,
    taxMode,
    taxRateBps,
  });
  return {
    category: dto.category,
    description: dto.description.trim(),
    amount: snapshot.amount,
    documentAmount: dto.amount,
    currency,
    exchangeRateMicros,
    exchangeRateId,
    taxMode,
    taxCode: taxMode === 'none' ? 'none' : 'vat_input',
    taxRateBps,
    taxBaseAmount: snapshot.taxBaseAmount,
    taxAmount: snapshot.taxAmount,
    point: dto.point?.trim() || null,
    supplierId: dto.supplierId || null,
    incurredAt,
  };
}

function replayExpense(
  expense: Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>,
  input: Awaited<ReturnType<typeof normalizedExpense>>,
) {
  const same = expense.category === input.category
    && expense.description === input.description
    && expense.amount === input.amount
    && expense.documentAmount === input.documentAmount
    && expense.currency === input.currency
    && expense.exchangeRateMicros === input.exchangeRateMicros
    && expense.exchangeRateId === input.exchangeRateId
    && expense.taxMode === input.taxMode
    && expense.taxCode === input.taxCode
    && expense.taxRateBps === input.taxRateBps
    && expense.taxBaseAmount === input.taxBaseAmount
    && expense.taxAmount === input.taxAmount
    && expense.point === input.point
    && expense.supplierId === input.supplierId
    && (!input.incurredAt || expense.incurredAt.toISOString() === input.incurredAt.toISOString());
  if (!same) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим расходом');
  return { ...expense, idempotent: true };
}

function replayOpeningBalance(
  document: Prisma.AccountingOpeningBalanceGetPayload<{ include: { accountingEntry: { include: { lines: true } }; lines: true } }>,
  input: { period: string; documentNumber: string; description: string; lines: Array<{ accountCode: string; debit: number; credit: number; memo: string | null }> },
) {
  const actual = {
    period: document.period,
    documentNumber: document.documentNumber,
    description: document.description,
    lines: document.lines
      .map((line) => ({ accountCode: line.accountCode, debit: line.debit, credit: line.credit, memo: line.memo }))
      .sort((left, right) => left.accountCode.localeCompare(right.accountCode)),
  };
  if (stableJson(actual) !== stableJson(input)) {
    throw new ConflictError('opening_balance_idempotency_conflict', 'Ключ opening balance уже использован для других данных');
  }
  return { ...document, idempotent: true };
}

function fixedAssetDate(value: string, field: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('fixed_asset_invalid_date', `${field}: неверная дата`);
  }
  return date;
}

function optionalFinanceDate(value: string | undefined, field: string) {
  if (!value) return null;
  return fixedAssetDate(value, field);
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function addMonthsToPeriod(period: string, months: number) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fixedAssetDepreciationAmount(cost: number, usefulLifeMonths: number, index: number) {
  const before = Math.floor((cost * index) / usefulLifeMonths);
  const after = Math.floor((cost * (index + 1)) / usefulLifeMonths);
  return after - before;
}

function replayFixedAsset(
  asset: Prisma.FixedAssetGetPayload<{ include: { acquisitionAccountingEntry: { include: { lines: true } }; depreciationEntries: true } }>,
  input: {
    assetNumber: string;
    name: string;
    category: string;
    serialNumber: string | null;
    acquisitionCost: number;
    usefulLifeMonths: number;
    acquiredAt: Date;
    inServiceAt: Date;
    fundingAccountCode: string;
    externalRef: string | null;
  },
) {
  const same = asset.assetNumber === input.assetNumber
    && asset.name === input.name
    && asset.category === input.category
    && asset.serialNumber === input.serialNumber
    && asset.acquisitionCost === input.acquisitionCost
    && asset.usefulLifeMonths === input.usefulLifeMonths
    && asset.acquiredAt.getTime() === input.acquiredAt.getTime()
    && asset.inServiceAt.getTime() === input.inServiceAt.getTime()
    && asset.fundingAccountCode === input.fundingAccountCode
    && asset.externalRef === input.externalRef;
  if (!same) throw new ConflictError('fixed_asset_idempotency_conflict', 'Ключ основного средства уже использован для других данных');
  return { ...asset, idempotent: true };
}

function replayFixedAssetDepreciation(
  depreciation: Prisma.FixedAssetDepreciationGetPayload<{ include: { fixedAsset: true; accountingEntry: { include: { lines: true } } } }>,
  fixedAssetId: string,
  period: string,
) {
  if (depreciation.fixedAssetId !== fixedAssetId || depreciation.period !== period) {
    throw new ConflictError('fixed_asset_depreciation_idempotency_conflict', 'Ключ амортизации уже использован для другого актива или периода');
  }
  return { ...depreciation, idempotent: true };
}

type AccountableAdvanceBalanceShape = {
  amount: number;
  settledAmount: number;
  returnedAmount: number;
  reimbursedAmount: number;
};

function accountableAdvanceBalance(advance: AccountableAdvanceBalanceShape) {
  return advance.amount - advance.settledAmount - advance.returnedAmount + advance.reimbursedAmount;
}

function accountableAdvanceStatus(amount: number, settledAmount: number, returnedAmount: number, reimbursedAmount: number) {
  const balance = amount - settledAmount - returnedAmount + reimbursedAmount;
  if (balance === 0) return 'settled' as const;
  if (settledAmount === 0 && returnedAmount === 0 && reimbursedAmount === 0) return 'open' as const;
  return 'partially_settled' as const;
}

function accountableAdvanceResponse<T extends AccountableAdvanceBalanceShape>(advance: T) {
  return { ...advance, balance: accountableAdvanceBalance(advance) };
}

function replayAccountableAdvance<T extends AccountableAdvanceBalanceShape & { staffId: string; purpose: string; point: string; dueAt: Date | null; fundingAccountCode: string; paymentReference: string }>(
  advance: T,
  input: { staffId: string; amount: number; purpose: string; point: string; dueAt: Date | null; fundingAccountCode: string; paymentReference: string },
) {
  const same = advance.staffId === input.staffId
    && advance.amount === input.amount
    && advance.purpose === input.purpose
    && advance.point === input.point
    && (advance.dueAt?.getTime() ?? null) === (input.dueAt?.getTime() ?? null)
    && advance.fundingAccountCode === input.fundingAccountCode
    && advance.paymentReference === input.paymentReference;
  if (!same) throw new ConflictError('accountable_advance_idempotency_conflict', 'Ключ подотчётного аванса уже использован для других данных');
  return { ...accountableAdvanceResponse(advance), idempotent: true };
}

function replayAccountableAdvanceSettlement<T extends { id: string; advanceId: string; idempotencyKey: string; amount: number; accountingEntryId: string; accountingEntry: unknown; expenseAccountCode: string; description: string; settledBy?: string; settledAt?: Date; advance: AccountableAdvanceBalanceShape }>(
  settlement: T,
  advanceId: string,
  amount: number,
  expenseAccountCode: string,
  description: string,
) {
  if (settlement.advanceId !== advanceId || settlement.amount !== amount || settlement.expenseAccountCode !== expenseAccountCode || settlement.description !== description) {
    throw new ConflictError('accountable_advance_settlement_idempotency_conflict', 'Ключ закрытия расхода уже использован для других данных');
  }
  return { advance: accountableAdvanceResponse(settlement.advance), settlement: accountableAdvanceActionResponse(settlement), idempotent: true };
}

function accountableAdvanceActionResponse<T extends { id: string; advanceId: string; idempotencyKey: string; amount: number; accountingEntryId: string; accountingEntry: unknown; expenseAccountCode?: string; description?: string; settledBy?: string; settledAt?: Date; fundingAccountCode?: string; paymentReference?: string }>(action: T) {
  return {
    id: action.id,
    advanceId: action.advanceId,
    idempotencyKey: action.idempotencyKey,
    amount: action.amount,
    accountingEntryId: action.accountingEntryId,
    accountingEntry: action.accountingEntry,
    ...(action.expenseAccountCode !== undefined ? { expenseAccountCode: action.expenseAccountCode, description: action.description, settledBy: action.settledBy, settledAt: action.settledAt } : {}),
    ...(action.fundingAccountCode !== undefined ? { fundingAccountCode: action.fundingAccountCode, paymentReference: action.paymentReference } : {}),
  };
}

function replayAccountableAdvanceClose<T extends { advanceId: string; amount: number; fundingAccountCode: string; paymentReference: string; advance: AccountableAdvanceBalanceShape }>(
  action: T,
  advanceId: string,
  dto: CloseAccountableAdvanceDto,
  kind: 'return' | 'reimburse',
) {
  if (action.advanceId !== advanceId || action.amount !== dto.amount || action.fundingAccountCode !== dto.fundingAccountCode || action.paymentReference !== dto.paymentReference.trim()) {
    throw new ConflictError('accountable_advance_close_idempotency_conflict', 'Ключ закрытия подотчёта уже использован для других данных');
  }
  return { advance: accountableAdvanceResponse(action.advance), [kind]: action, idempotent: true };
}

function replayCurrencyRate(
  rate: { id: string; currency: string; baseCurrency: string; rateMicros: number; effectiveAt: Date; source: string },
  input: { currency: string; baseCurrency: string; rateMicros: number; effectiveAt: Date; source: string },
) {
  const same = rate.currency === input.currency
    && rate.baseCurrency === input.baseCurrency
    && rate.rateMicros === input.rateMicros
    && rate.effectiveAt.toISOString() === input.effectiveAt.toISOString()
    && rate.source === input.source;
  if (!same) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим курсом');
  return { ...rate, idempotent: true };
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

async function accountingPeriodReadinessOnTx(
  tx: Prisma.TransactionClient,
  period: string,
) {
  const [from, to] = periodBounds(period);
  const [openSettlements, openCashShifts, openRefunds, openSupplierInvoices, openBankStatements, openPayrollRuns, openAdvances, openForeignExpenses] = await Promise.all([
    tx.financeSettlementRun.count({
      where: {
        periodStart: { lt: to },
        periodEnd: { gt: from },
        OR: [
          { status: { not: 'closed' } },
          { lines: { some: { status: 'disputed' } } },
        ],
      },
    }),
    tx.cashShift.count({
      where: {
        openedAt: { lt: to },
        OR: [{ closedAt: null }, { closedAt: { gte: to } }],
      },
    }),
    tx.refund.count({
      where: {
        createdAt: { gte: from, lt: to },
        OR: [
          { status: { in: ['requested', 'approved', 'processing', 'partially_succeeded'] } },
          { allocations: { some: { status: { not: 'succeeded' } } } },
        ],
      },
    }),
    tx.supplierInvoice.count({
      where: {
        createdAt: { gte: from, lt: to },
        status: { in: ['draft', 'approved', 'partially_paid'] },
      },
    }),
    tx.bankStatement.count({
      where: {
        periodStart: { lt: to },
        periodEnd: { gt: from },
        status: { not: 'reconciled' },
      },
    }),
    tx.hrPayrollRun.count({ where: { period, status: 'posted' } }),
    tx.accountableAdvance.count({
      where: {
        issuedAt: { gte: from, lt: to },
        status: { in: ['open', 'partially_settled'] },
      },
    }),
    tx.expense.count({
      where: {
        incurredAt: { gte: from, lt: to },
        currency: { not: 'KGS' },
        status: { in: ['submitted', 'approved'] },
      },
    }),
  ]);

  const blockers = [
    openSettlements > 0 && { code: 'finance_settlement_open', message: `В периоде остались незакрытые финансовые сверки: ${openSettlements}` },
    openCashShifts > 0 && { code: 'cash_shift_open', message: `В периоде остались открытые кассовые смены: ${openCashShifts}` },
    openRefunds > 0 && { code: 'refund_execution_open', message: `В периоде остались незавершённые возвраты: ${openRefunds}` },
    openSupplierInvoices > 0 && { code: 'supplier_invoice_open', message: `В периоде остались незакрытые счета поставщиков: ${openSupplierInvoices}` },
    openBankStatements > 0 && { code: 'bank_statement_open', message: `В периоде остались несверенные банковские выписки: ${openBankStatements}` },
    openPayrollRuns > 0 && { code: 'payroll_open', message: `В периоде остались ненаправленные в выплату payroll-запуски: ${openPayrollRuns}` },
    openAdvances > 0 && { code: 'accountable_advance_open', message: `В периоде остались незакрытые подотчётные авансы: ${openAdvances}` },
    openForeignExpenses > 0 && { code: 'fx_revaluation_required', message: `В периоде остались иностранные расходы без утверждённой FX-переоценки: ${openForeignExpenses}` },
  ].filter((blocker): blocker is { code: string; message: string } => Boolean(blocker));

  return {
    period,
    from,
    to,
    ready: blockers.length === 0,
    blockers,
    counts: { openSettlements, openCashShifts, openRefunds, openSupplierInvoices, openBankStatements, openPayrollRuns, openAdvances, openForeignExpenses },
  };
}

function validateMonth(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new ValidationError('invalid_accounting_period', 'Период должен быть в формате YYYY-MM');
  }
  return period;
}
