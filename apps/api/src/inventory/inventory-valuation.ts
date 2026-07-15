import { Prisma } from '@prisma/client';
import { postAccountingEntryOnTx } from '../finance/accounting-journal';
import { ConflictError } from '../common/errors';

export const INVENTORY_ASSET_ACCOUNT = '1200';
export const COGS_ACCOUNT = '5000';

export async function postCogsOnTx(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    orderId: string;
    sourceRef: string;
    imei?: string;
    layerId?: string;
    quantity: number;
    unitCost: number;
    actor: string;
    occurredAt?: Date;
  },
) {
  const totalCost = input.quantity * input.unitCost;
  const issue = await tx.inventoryValuationIssue.upsert({
    where: { sourceType_sourceRef: { sourceType: 'sale', sourceRef: input.sourceRef } },
    create: {
      productId: input.productId,
      orderId: input.orderId,
      imei: input.imei,
      layerId: input.layerId,
      sourceType: 'sale',
      sourceRef: input.sourceRef,
      quantity: input.quantity,
      unitCost: input.unitCost,
      totalCost,
    },
    update: {},
  });
  const entry = await postAccountingEntryOnTx(tx, {
    idempotencyKey: `accounting:inventory.cogs:${issue.id}`,
    sourceType: 'inventory.cogs',
    sourceRef: issue.id,
    description: `Себестоимость продажи ${input.orderId}`,
    occurredAt: input.occurredAt ?? new Date(),
    createdBy: input.actor,
    lines: [
      { accountCode: COGS_ACCOUNT, debit: totalCost, memo: 'Себестоимость проданного товара' },
      { accountCode: INVENTORY_ASSET_ACCOUNT, credit: totalCost, memo: 'Выбытие товарного запаса' },
    ],
  });
  return { issue, entry };
}

export async function consumeQuantityValuationOnTx(
  tx: Prisma.TransactionClient,
  input: { orderId: string; allocationId: string; productId: string; balanceId: string; quantity: number; actor: string },
) {
  const balance = await tx.inventoryBalance.findUnique({ where: { id: input.balanceId }, select: { inventoryValue: true } });
  // Consignment quantities are physically tracked in InventoryBalance but have
  // no owned asset value; their owner liability is posted separately.
  if (balance?.inventoryValue === 0) return 0;
  const layers = await tx.inventoryValuationLayer.findMany({
    where: { balanceId: input.balanceId, quantityRemaining: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  let remaining = input.quantity;
  let totalCost = 0;
  for (const layer of layers) {
    if (remaining === 0) break;
    const quantity = Math.min(remaining, layer.quantityRemaining);
    const updatedLayer = await tx.inventoryValuationLayer.updateMany({
      where: { id: layer.id, quantityRemaining: { gte: quantity } },
      data: { quantityRemaining: { decrement: quantity } },
    });
    if (updatedLayer.count !== 1) throw new ConflictError('valuation_layer_race', `Слой себестоимости ${layer.id} уже изменён`);
    const issue = await postCogsOnTx(tx, {
      productId: input.productId,
      orderId: input.orderId,
      sourceRef: `${input.orderId}:${input.allocationId}:${layer.id}`,
      layerId: layer.id,
      quantity,
      unitCost: layer.unitCost,
      actor: input.actor,
    });
    totalCost += issue.issue.totalCost;
    remaining -= quantity;
  }
  if (remaining > 0) throw new ConflictError('inventory_valuation_missing', `Для резерва ${input.allocationId} не найдено достаточно слоёв себестоимости`);
  return totalCost;
}
