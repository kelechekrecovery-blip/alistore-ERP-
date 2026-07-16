import { Prisma } from '@prisma/client';
import { postAccountingEntryOnTx } from '../finance/accounting-journal';
import { ConflictError } from '../common/errors';

export const INVENTORY_ASSET_ACCOUNT = '1200';
export const COGS_ACCOUNT = '5000';
export const INVENTORY_VARIANCE_ACCOUNT = '6900';

export async function adjustQuantityValuationOnTx(
  tx: Prisma.TransactionClient,
  input: {
    movementId: string;
    productId: string;
    balanceId: string;
    location: string;
    quantityDelta: number;
    unitCost?: number;
    actor: string;
    sourceType: 'inventory.write_off' | 'inventory.adjustment';
  },
) {
  if (input.quantityDelta > 0) {
    const unitCost = input.unitCost ?? 0;
    const totalValue = input.quantityDelta * unitCost;
    await tx.inventoryValuationLayer.create({
      data: {
        productId: input.productId,
        balanceId: input.balanceId,
        location: input.location,
        sourceType: input.sourceType,
        sourceRef: input.movementId,
        unitCost,
        quantityReceived: input.quantityDelta,
        quantityRemaining: input.quantityDelta,
      },
    });
    if (totalValue > 0) {
      await tx.inventoryBalance.update({
        where: { id: input.balanceId },
        data: { inventoryValue: { increment: totalValue } },
      });
    }
    const entry = totalValue > 0
      ? await postInventoryVarianceOnTx(tx, input, totalValue, true)
      : null;
    return { totalValue, unitCost, entry };
  }

  const quantity = Math.abs(input.quantityDelta);
  const balance = await tx.inventoryBalance.findUniqueOrThrow({
    where: { id: input.balanceId },
    select: { inventoryValue: true },
  });
  if (balance.inventoryValue === 0) {
    return { totalValue: 0, unitCost: null as number | null, entry: null };
  }
  const layers = await tx.inventoryValuationLayer.findMany({
    where: { balanceId: input.balanceId, quantityRemaining: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  let remaining = quantity;
  let totalValue = 0;
  const unitCosts = new Set<number>();
  for (const layer of layers) {
    if (remaining === 0) break;
    const consumed = Math.min(remaining, layer.quantityRemaining);
    const claimed = await tx.inventoryValuationLayer.updateMany({
      where: { id: layer.id, quantityRemaining: { gte: consumed } },
      data: { quantityRemaining: { decrement: consumed } },
    });
    if (claimed.count !== 1) {
      throw new ConflictError('valuation_layer_race', `Слой себестоимости ${layer.id} уже изменён`);
    }
    await tx.inventoryValuationIssue.create({
      data: {
        productId: input.productId,
        layerId: layer.id,
        sourceType: input.sourceType,
        sourceRef: `${input.movementId}:${layer.id}`,
        quantity: consumed,
        unitCost: layer.unitCost,
        totalCost: consumed * layer.unitCost,
      },
    });
    remaining -= consumed;
    totalValue += consumed * layer.unitCost;
    unitCosts.add(layer.unitCost);
  }
  if (remaining > 0) {
    throw new ConflictError(
      'inventory_valuation_missing',
      `Для движения ${input.movementId} не найдено достаточно слоёв себестоимости`,
    );
  }
  const updated = await tx.inventoryBalance.updateMany({
    where: { id: input.balanceId, inventoryValue: { gte: totalValue } },
    data: { inventoryValue: { decrement: totalValue } },
  });
  if (updated.count !== 1) {
    throw new ConflictError('inventory_value_mismatch', 'Стоимость остатка меньше стоимости складского движения');
  }
  const entry = totalValue > 0
    ? await postInventoryVarianceOnTx(tx, input, totalValue, false)
    : null;
  return { totalValue, unitCost: unitCosts.size === 1 ? [...unitCosts][0] : null, entry };
}

async function postInventoryVarianceOnTx(
  tx: Prisma.TransactionClient,
  input: {
    movementId: string;
    actor: string;
    sourceType: 'inventory.write_off' | 'inventory.adjustment';
  },
  totalValue: number,
  increase: boolean,
) {
  return postAccountingEntryOnTx(tx, {
    idempotencyKey: `accounting:${input.sourceType}:${input.movementId}`,
    sourceType: input.sourceType,
    sourceRef: input.movementId,
    description: `${increase ? 'Оприходование' : 'Списание'} запасов по движению ${input.movementId}`,
    occurredAt: new Date(),
    createdBy: input.actor,
    lines: increase
      ? [
        { accountCode: INVENTORY_ASSET_ACCOUNT, debit: totalValue, memo: 'Увеличение стоимости запасов' },
        { accountCode: INVENTORY_VARIANCE_ACCOUNT, credit: totalValue, memo: 'Излишек по складской корректировке' },
      ]
      : [
        { accountCode: INVENTORY_VARIANCE_ACCOUNT, debit: totalValue, memo: 'Недостача или списание запасов' },
        { accountCode: INVENTORY_ASSET_ACCOUNT, credit: totalValue, memo: 'Уменьшение стоимости запасов' },
      ],
  });
}

export async function transferQuantityValuationOnTx(
  tx: Prisma.TransactionClient,
  input: {
    movementId: string;
    productId: string;
    sourceBalanceId: string;
    destinationBalanceId: string;
    destination: string;
    quantity: number;
  },
) {
  if (input.quantity === 0) return { totalValue: 0, unitCost: null as number | null };

  const layers = await tx.inventoryValuationLayer.findMany({
    where: { balanceId: input.sourceBalanceId, quantityRemaining: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  let remaining = input.quantity;
  let totalValue = 0;
  const unitCosts = new Set<number>();

  for (const layer of layers) {
    if (remaining === 0) break;
    const quantity = Math.min(remaining, layer.quantityRemaining);
    const claimed = await tx.inventoryValuationLayer.updateMany({
      where: { id: layer.id, quantityRemaining: { gte: quantity } },
      data: { quantityRemaining: { decrement: quantity } },
    });
    if (claimed.count !== 1) {
      throw new ConflictError('valuation_layer_race', `Слой себестоимости ${layer.id} уже изменён`);
    }
    await tx.inventoryValuationLayer.create({
      data: {
        productId: input.productId,
        balanceId: input.destinationBalanceId,
        location: input.destination,
        sourceType: 'inventory.transfer',
        sourceRef: `${input.movementId}:${layer.id}`,
        unitCost: layer.unitCost,
        quantityReceived: quantity,
        quantityRemaining: quantity,
      },
    });
    remaining -= quantity;
    totalValue += quantity * layer.unitCost;
    unitCosts.add(layer.unitCost);
  }

  if (remaining > 0) {
    throw new ConflictError(
      'inventory_valuation_missing',
      `Для перемещения ${input.movementId} не найдено достаточно слоёв себестоимости`,
    );
  }
  const sourceValue = await tx.inventoryBalance.updateMany({
    where: { id: input.sourceBalanceId, inventoryValue: { gte: totalValue } },
    data: { inventoryValue: { decrement: totalValue } },
  });
  if (sourceValue.count !== 1) {
    throw new ConflictError('inventory_value_mismatch', 'Стоимость исходного остатка меньше стоимости перемещения');
  }
  await tx.inventoryBalance.update({
    where: { id: input.destinationBalanceId },
    data: { inventoryValue: { increment: totalValue } },
  });
  return { totalValue, unitCost: unitCosts.size === 1 ? [...unitCosts][0] : null };
}

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

export async function reverseInventoryCostOnTx(
  tx: Prisma.TransactionClient,
  input: {
    issueId: string;
    quantity: number;
    returnId: string;
    actor: string;
    occurredAt?: Date;
  },
) {
  const issue = await tx.inventoryValuationIssue.findUniqueOrThrow({ where: { id: input.issueId } });
  const available = issue.quantity - issue.reversedQty;
  if (input.quantity <= 0 || input.quantity > available) {
    throw new ConflictError('valuation_return_exceeded', `Возврат превышает неразвёрнутую себестоимость ${issue.id}`);
  }
  const sourceRef = `${input.returnId}:${issue.id}:${issue.reversedQty + input.quantity}`;
  const updated = await tx.inventoryValuationIssue.updateMany({
    where: { id: issue.id, reversedQty: issue.reversedQty },
    data: { reversedQty: { increment: input.quantity } },
  });
  if (updated.count !== 1) throw new ConflictError('valuation_return_race', `Себестоимость ${issue.id} изменена параллельно`);
  const total = input.quantity * issue.unitCost;
  const entry = await postAccountingEntryOnTx(tx, {
    idempotencyKey: `accounting:inventory.return:${sourceRef}`,
    sourceType: 'inventory.return',
    sourceRef,
    description: `Восстановление себестоимости возврата ${input.returnId}`,
    occurredAt: input.occurredAt ?? new Date(),
    createdBy: input.actor,
    lines: [
      { accountCode: INVENTORY_ASSET_ACCOUNT, debit: total, memo: 'Возврат товара на склад' },
      { accountCode: COGS_ACCOUNT, credit: total, memo: 'Сторно себестоимости продаж' },
    ],
  });
  return { issue, quantity: input.quantity, unitCost: issue.unitCost, totalCost: total, entry };
}

export async function reverseQuantityCostOnTx(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    allocationId: string;
    productId: string;
    balanceId: string;
    quantity: number;
    returnId: string;
    actor: string;
  },
) {
  const issues = await tx.inventoryValuationIssue.findMany({
    where: {
      orderId: input.orderId,
      productId: input.productId,
      sourceType: 'sale',
      sourceRef: { startsWith: `${input.orderId}:${input.allocationId}:` },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  let remaining = input.quantity;
  let totalCost = 0;
  const entries: Array<{ id: string; issueId: string; quantity: number; totalCost: number }> = [];
  const location = (await tx.inventoryBalance.findUniqueOrThrow({
    where: { id: input.balanceId },
    select: { location: true },
  })).location;
  for (const issue of issues) {
    if (remaining === 0) break;
    const quantity = Math.min(remaining, issue.quantity - issue.reversedQty);
    if (quantity <= 0) continue;
    const reversed = await reverseInventoryCostOnTx(tx, {
      issueId: issue.id,
      quantity,
      returnId: input.returnId,
      actor: input.actor,
    });
    await tx.inventoryValuationLayer.create({
      data: {
        productId: input.productId,
        balanceId: input.balanceId,
        location,
        sourceType: 'inventory.return',
        sourceRef: `${input.returnId}:${issue.id}:${quantity}`,
        unitCost: reversed.unitCost,
        quantityReceived: quantity,
        quantityRemaining: quantity,
      },
    });
    remaining -= quantity;
    totalCost += reversed.totalCost;
    entries.push({
      id: reversed.entry.id,
      issueId: issue.id,
      quantity,
      totalCost: reversed.totalCost,
    });
  }
  // Orders created before immutable valuation was introduced have no issues.
  // Once an order has valuation provenance, an incomplete reversal is a hard
  // conflict: silently accepting it would overstate COGS and understate stock.
  if (remaining > 0 && issues.length > 0) {
    throw new ConflictError('valuation_return_missing', `Для возврата ${input.returnId} не найдена полная себестоимость`);
  }
  return { quantity: input.quantity - remaining, totalCost, entries };
}
