import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';

export interface DebtInput {
  orderId: string;
  customerId: string;
  principal: number;
  installments: number;
  dueDate: Date;
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
  const debt = await tx.debtPlan.create({
    data: {
      orderId: input.orderId,
      customerId: input.customerId,
      principal: input.principal,
      balance: input.principal,
      installments: input.installments,
      dueDate: input.dueDate,
      status: 'open',
    },
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
  return debt;
}
