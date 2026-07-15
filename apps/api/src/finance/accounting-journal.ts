import { AccountingAccountType, PaymentMethod, Prisma } from '@prisma/client';
import { ConflictError, ValidationError } from '../common/errors';

export const FUNDING_ACCOUNT_CODES = ['1000', '1010', '1020'] as const;

const EXPENSE_ACCOUNT_BY_CATEGORY: Record<string, string> = {
  payroll: '6100',
  rent: '6200',
  logistics: '6300',
  marketing: '6400',
  utilities: '6500',
  procurement: '6600',
  other: '6900',
};

export type AccountingJournalLineInput = {
  accountCode: string;
  debit?: number;
  credit?: number;
  memo?: string | null;
};

export type AccountingJournalEntryInput = {
  idempotencyKey: string;
  sourceType: string;
  sourceRef: string;
  description: string;
  point?: string | null;
  occurredAt: Date;
  createdBy: string;
  lines: AccountingJournalLineInput[];
};

export function expenseAccountCode(category: string) {
  return EXPENSE_ACCOUNT_BY_CATEGORY[category] ?? EXPENSE_ACCOUNT_BY_CATEGORY.other;
}

export function paymentAccountCode(method: PaymentMethod) {
  if (method === 'cash') return '1000';
  if (method === 'gift_card') return '2300';
  return '1020';
}

export async function postPaymentEntryOnTx(
  tx: Prisma.TransactionClient,
  input: {
    payment: {
      id: string;
      amount: number;
      method: PaymentMethod;
      orderId: string | null;
      serviceWorkOrderId: string | null;
      createdAt: Date;
    };
    idempotencyKey: string;
    point?: string | null;
    actor: string;
    receivedBy?: string | null;
  },
) {
  if (input.payment.amount === 0) {
    throw new ValidationError('accounting_payment_zero', 'Нулевой платёж нельзя провести');
  }
  const amount = Math.abs(input.payment.amount);
  const accountCode = paymentAccountCode(input.payment.method);
  const revenueCode = input.payment.serviceWorkOrderId ? '4100' : '4000';
  const isRefund = input.payment.amount < 0;
  const entry = await postAccountingEntryOnTx(tx, {
    idempotencyKey: `accounting:${input.idempotencyKey}`,
    sourceType: isRefund ? 'payment.refund' : 'payment.receipt',
    sourceRef: input.payment.id,
    description: `${isRefund ? 'Возврат' : 'Получение'} платежа ${input.payment.id}`,
    point: input.point,
    occurredAt: input.payment.createdAt,
    createdBy: input.actor,
    lines: isRefund
      ? [
        { accountCode: revenueCode, debit: amount, memo: 'Уменьшение выручки' },
        { accountCode, credit: amount, memo: 'Выбытие денежных средств' },
      ]
      : [
        { accountCode, debit: amount, memo: 'Поступление денежных средств' },
        { accountCode: revenueCode, credit: amount, memo: 'Признание выручки' },
      ],
  });
  await tx.payment.update({
    where: { id: input.payment.id },
    data: {
      accountCode,
      accountingEntryId: entry.id,
      idempotencyKey: input.idempotencyKey,
      point: input.point?.trim() || null,
      receivedBy: input.receivedBy ?? input.actor,
    },
  });
  return entry;
}

export async function postAccountingEntryOnTx(tx: Prisma.TransactionClient, input: AccountingJournalEntryInput) {
  const normalized = normalizeEntry(input);
  const existing = await tx.accountingJournalEntry.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { lines: { orderBy: { accountCode: 'asc' } } },
  });
  if (existing) return replayEntry(existing, normalized);

  const sourceEntry = await tx.accountingJournalEntry.findUnique({
    where: { sourceType_sourceRef: { sourceType: normalized.sourceType, sourceRef: normalized.sourceRef } },
    select: { id: true },
  });
  if (sourceEntry) {
    throw new ConflictError('accounting_source_already_posted', 'Для этого первичного документа проводка уже создана');
  }

  const period = accountingPeriodKey(normalized.occurredAt);
  const accountingPeriod = await tx.accountingPeriod.upsert({
    where: { period },
    create: { period },
    update: {},
    select: { status: true },
  });
  if (accountingPeriod.status === 'hard_closed') {
    throw new ConflictError('accounting_period_hard_closed', `Бухгалтерский период ${period} закрыт для новых проводок`);
  }

  const accountCodes = [...new Set(normalized.lines.map((line) => line.accountCode))];
  const accounts = await tx.accountingAccount.findMany({
    where: { code: { in: accountCodes }, active: true },
    select: { code: true },
  });
  if (accounts.length !== accountCodes.length) {
    const found = new Set(accounts.map((account) => account.code));
    throw new ValidationError('accounting_account_invalid', `Счёт ${accountCodes.find((code) => !found.has(code))} не найден или отключён`);
  }

  const entry = await tx.accountingJournalEntry.create({
    data: {
      idempotencyKey: normalized.idempotencyKey,
      sourceType: normalized.sourceType,
      sourceRef: normalized.sourceRef,
      description: normalized.description,
      point: normalized.point,
      occurredAt: normalized.occurredAt,
      createdBy: normalized.createdBy,
      lines: { create: normalized.lines },
    },
    include: { lines: { orderBy: { accountCode: 'asc' } } },
  });
  return { ...entry, idempotent: false };
}

export function accountingPeriodKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function normalBalance(type: AccountingAccountType, debit: number, credit: number) {
  return type === 'asset' || type === 'expense' ? debit - credit : credit - debit;
}

function normalizeEntry(input: AccountingJournalEntryInput) {
  const lines = input.lines.map((line) => ({
    accountCode: line.accountCode.trim(),
    debit: line.debit ?? 0,
    credit: line.credit ?? 0,
    memo: line.memo?.trim() || null,
  }));
  if (lines.length < 2) throw new ValidationError('accounting_lines_required', 'Проводка должна содержать минимум две строки');
  for (const line of lines) {
    if (!line.accountCode || !Number.isSafeInteger(line.debit) || !Number.isSafeInteger(line.credit) || line.debit < 0 || line.credit < 0 || (line.debit > 0) === (line.credit > 0)) {
      throw new ValidationError('accounting_line_invalid', 'В каждой строке должен быть указан ровно один положительный дебет или кредит');
    }
  }
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (debit <= 0 || debit !== credit) throw new ValidationError('accounting_entry_unbalanced', 'Дебет и кредит проводки должны совпадать');
  return {
    ...input,
    sourceType: input.sourceType.trim(),
    sourceRef: input.sourceRef.trim(),
    description: input.description.trim(),
    point: input.point?.trim() || null,
    lines: lines.sort((left, right) => left.accountCode.localeCompare(right.accountCode)),
  };
}

function replayEntry(
  existing: Awaited<ReturnType<Prisma.TransactionClient['accountingJournalEntry']['findUniqueOrThrow']>> & { lines: Array<{ accountCode: string; debit: number; credit: number; memo: string | null }> },
  input: ReturnType<typeof normalizeEntry>,
) {
  const existingLines = existing.lines.map((line) => ({ accountCode: line.accountCode, debit: line.debit, credit: line.credit, memo: line.memo }));
  const same = existing.sourceType === input.sourceType
    && existing.sourceRef === input.sourceRef
    && existing.description === input.description
    && existing.point === input.point
    && existing.occurredAt.getTime() === input.occurredAt.getTime()
    && JSON.stringify(existingLines) === JSON.stringify(input.lines);
  if (!same) throw new ConflictError('accounting_idempotency_conflict', 'Idempotency key уже использован для другой проводки');
  return { ...existing, idempotent: true };
}
