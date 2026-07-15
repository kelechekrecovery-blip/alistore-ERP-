import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { postOrderReceivableOnTx } from '../finance/accounting-journal';

export interface DebtInput {
  orderId: string;
  customerId: string;
  principal: number;
  installments: number;
  dueDate: Date;
  idempotencyKey?: string | null;
}

/**
 * Create a DebtPlan (balance starts at principal) and append its debt.created event.
 * Shared by the direct under-limit path (DebtsService) and the approval executor
 * (over-limit) so both write identical state and ledger entries.
 */
export async function insertDebt(
  tx: Prisma.TransactionClient,
  input: DebtInput,
  actor: string,
  events: AuditInput[],
) {
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: { select: { taxCode: true, taxRateBps: true, taxAmount: true } },
      payments: { select: { amount: true, status: true } },
    },
  });
  if (!order) throw new ValidationError('order_not_found', `Заказ ${input.orderId} не найден`);
  if (order.customerId !== input.customerId) {
    throw new ValidationError('debt_customer_mismatch', 'Долг должен принадлежать покупателю заказа');
  }
  const replay = input.idempotencyKey
    ? await tx.debtPlan.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    : null;
  if (replay) {
    const sameCommand = replay.orderId === input.orderId
      && replay.customerId === input.customerId
      && replay.principal === input.principal
      && replay.installments === input.installments;
    if (sameCommand) return replay;
    throw new ConflictError('debt_idempotency_conflict', 'Ключ создания долга уже использован с другими параметрами');
  }
  const existing = await tx.debtPlan.findUnique({ where: { orderId: input.orderId } });
  if (existing) {
    throw new ConflictError('order_debt_exists', 'Для заказа уже оформлен долг или рассрочка');
  }
  const processedBefore = order.payments
    .filter((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = Math.max(0, order.total - processedBefore);
  if (input.principal > outstanding) {
    throw new ValidationError('debt_principal_exceeds_outstanding', `Непокрытый остаток заказа: ${outstanding}`);
  }
  const debt = await tx.debtPlan.create({
    data: {
      orderId: input.orderId,
      customerId: input.customerId,
      principal: input.principal,
      balance: input.principal,
      installments: input.installments,
      dueDate: input.dueDate,
      status: 'open',
      idempotencyKey: input.idempotencyKey,
    },
  });
  const accountingEntry = await postOrderReceivableOnTx(tx, {
    idempotencyKey: `accounting:debt.origination:${debt.id}`,
    sourceType: 'debt.origination',
    sourceRef: debt.id,
    description: `Возникновение долга по заказу ${input.orderId}`,
    order,
    processedBefore,
    amount: input.principal,
    occurredAt: debt.createdAt,
    actor,
  });
  const postedDebt = await tx.debtPlan.update({
    where: { id: debt.id },
    data: { accountingEntryId: accountingEntry.id },
  });
  events.push({
    type: EventType.DebtCreated,
    actor,
    payload: {
      debtId: debt.id,
      orderId: input.orderId,
      customerId: input.customerId,
      principal: input.principal,
      installments: input.installments,
      dueDate: input.dueDate.toISOString(),
    },
    refs: [debt.id, input.orderId, input.customerId],
  });
  events.push({
    type: EventType.AccountingEntryPosted,
    actor,
    payload: {
      accountingEntryId: accountingEntry.id,
      sourceType: 'debt.origination',
      sourceRef: debt.id,
      debtId: debt.id,
      orderId: input.orderId,
      amount: input.principal,
      taxAmount: accountingEntry.taxAmount,
    },
    refs: [accountingEntry.id, debt.id, input.orderId],
  });
  return postedDebt;
}
