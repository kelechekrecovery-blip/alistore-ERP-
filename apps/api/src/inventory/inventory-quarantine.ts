import { Prisma } from '@prisma/client';

export function createQuarantineCaseOnTx(
  tx: Prisma.TransactionClient,
  input: {
    unitId: string;
    sourceType: 'return' | 'exchange';
    returnId: string;
    reason: string;
    unitCost: number;
    actor: string;
  },
) {
  return tx.inventoryQuarantineCase.upsert({
    where: {
      sourceType_returnId_unitId: {
        sourceType: input.sourceType,
        returnId: input.returnId,
        unitId: input.unitId,
      },
    },
    create: {
      unitId: input.unitId,
      sourceType: input.sourceType,
      returnId: input.returnId,
      reason: input.reason,
      unitCost: input.unitCost,
      createdBy: input.actor,
    },
    update: {},
  });
}
