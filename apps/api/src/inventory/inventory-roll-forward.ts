import { Prisma } from '@prisma/client';
import { ValidationError } from '../common/errors';

type Bucket = 'receipts' | 'returns' | 'transferIn' | 'transferOut' | 'issues' | 'adjustmentsIn' | 'adjustmentsOut';

type Amount = { quantity: number; value: number };

const MAX_REPORT_SPAN_MS = 366 * 24 * 60 * 60 * 1000;

type Row = {
  productId: string;
  sku: string;
  name: string;
  location: string;
  opening: Amount;
  receipts: Amount;
  returns: Amount;
  transferIn: Amount;
  transferOut: Amount;
  issues: Amount;
  adjustmentsIn: Amount;
  adjustmentsOut: Amount;
  closing: Amount;
};

const amount = (): Amount => ({ quantity: 0, value: 0 });

export async function inventoryValuationRollForward(
  prisma: Prisma.TransactionClient,
  fromInput: string,
  toInput: string,
) {
  const from = new Date(fromInput);
  const to = new Date(toInput);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
    throw new ValidationError('valuation_period_invalid', 'Начало периода должно быть раньше окончания');
  }
  if (to.getTime() - from.getTime() > MAX_REPORT_SPAN_MS) {
    throw new ValidationError('valuation_period_too_large', 'Период отчёта не может превышать 366 дней');
  }

  const [layers, issues, reversals, transfers, serializedReceipts, serviceConsumptions, quantityBalances, glLines, reversalCoverage] = await Promise.all([
    prisma.inventoryValuationLayer.findMany({
      where: { createdAt: { lt: to }, sourceType: { not: 'inventory.transfer' } },
      include: { product: { select: { sku: true, name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.inventoryValuationIssue.findMany({
      where: { createdAt: { lt: to } },
      include: {
        product: { select: { sku: true, name: true } },
        unit: { select: { consignmentItem: { select: { id: true } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.inventoryValuationReversal.findMany({
      where: { createdAt: { lt: to } },
      include: {
        product: { select: { sku: true, name: true } },
        issue: { select: { unit: { select: { consignmentItem: { select: { id: true } } } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.inventoryMovement.findMany({
      where: { type: 'moved', createdAt: { lt: to } },
      include: { product: { select: { sku: true, name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.inventoryMovement.findMany({
      where: {
        type: 'received',
        createdAt: { lt: to },
        product: { trackingMode: 'serialized' },
      },
      include: { product: { select: { sku: true, name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.inventoryMovement.findMany({
      where: { type: 'service_consumed', createdAt: { lt: to } },
      select: { id: true, valuationQty: true, totalValue: true },
    }),
    prisma.inventoryBalance.findMany({
      where: { product: { trackingMode: 'quantity' } },
      select: {
        onHand: true,
        inventoryValue: true,
        valuationLayers: { where: { quantityRemaining: { gt: 0 } }, select: { quantityRemaining: true, unitCost: true } },
        quantityConsignmentLots: { select: { availableQty: true, reservedQty: true } },
      },
    }),
    prisma.accountingJournalLine.findMany({
      where: { accountCode: '1200', entry: { occurredAt: { lt: to } } },
      include: { entry: { select: { occurredAt: true } } },
    }),
    prisma.inventoryValuationIssue.findMany({
      where: { reversedQty: { gt: 0 }, createdAt: { lt: to } },
      select: { id: true, reversedQty: true, location: true, reversals: { select: { quantity: true } } },
    }),
  ]);

  const rows = new Map<string, Row>();
  const getRow = (productId: string, sku: string, name: string, location: string) => {
    const key = `${productId}\u0000${location}`;
    const existing = rows.get(key);
    if (existing) return existing;
    const created: Row = {
      productId, sku, name, location,
      opening: amount(), receipts: amount(), returns: amount(), transferIn: amount(), transferOut: amount(),
      issues: amount(), adjustmentsIn: amount(), adjustmentsOut: amount(), closing: amount(),
    };
    rows.set(key, created);
    return created;
  };
  const add = (
    at: Date,
    product: { id: string; sku: string; name: string },
    location: string,
    bucket: Bucket,
    quantity: number,
    value: number,
  ) => {
    const row = getRow(product.id, product.sku, product.name, location);
    if (at < from) {
      const sign = bucket === 'issues' || bucket === 'transferOut' || bucket === 'adjustmentsOut' ? -1 : 1;
      row.opening.quantity += sign * quantity;
      row.opening.value += sign * value;
      return;
    }
    row[bucket].quantity += quantity;
    row[bucket].value += value;
  };

  for (const layer of layers) {
    if (layer.sourceType === 'inventory.return') continue;
    const bucket: Bucket = layer.sourceType === 'inventory.adjustment' ? 'adjustmentsIn' : 'receipts';
    add(layer.createdAt, { id: layer.productId, ...layer.product }, layer.location, bucket, layer.quantityReceived, layer.quantityReceived * layer.unitCost);
  }
  for (const movement of serializedReceipts) {
    if (!movement.to) continue;
    add(movement.createdAt, { id: movement.productId, ...movement.product }, movement.to, 'receipts', movement.qty, movement.totalValue ?? 0);
  }
  const ownedReversals = reversals.filter((reversal) => !reversal.issue.unit?.consignmentItem);
  const ownedIssues = issues.filter((issue) => !issue.unit?.consignmentItem);
  for (const reversal of ownedReversals) {
    add(reversal.createdAt, { id: reversal.productId, ...reversal.product }, reversal.location, 'returns', reversal.quantity, reversal.totalCost);
  }
  for (const issue of ownedIssues) {
    const bucket: Bucket = issue.sourceType === 'sale' ? 'issues' : 'adjustmentsOut';
    add(issue.createdAt, { id: issue.productId, ...issue.product }, issue.location ?? 'UNKNOWN', bucket, issue.quantity, issue.totalCost);
  }
  for (const movement of transfers) {
    const quantity = movement.valuationQty ?? 0;
    const value = movement.totalValue ?? 0;
    const product = { id: movement.productId, ...movement.product };
    if (movement.from) add(movement.createdAt, product, movement.from, 'transferOut', quantity, value);
    if (movement.to) add(movement.createdAt, product, movement.to, 'transferIn', quantity, value);
  }

  for (const row of rows.values()) {
    row.closing.quantity = row.opening.quantity + row.receipts.quantity + row.returns.quantity
      + row.transferIn.quantity + row.adjustmentsIn.quantity
      - row.issues.quantity - row.transferOut.quantity - row.adjustmentsOut.quantity;
    row.closing.value = row.opening.value + row.receipts.value + row.returns.value
      + row.transferIn.value + row.adjustmentsIn.value
      - row.issues.value - row.transferOut.value - row.adjustmentsOut.value;
  }

  const orderedRows = [...rows.values()].sort((a, b) => a.location.localeCompare(b.location) || a.sku.localeCompare(b.sku));
  const openingValue = orderedRows.reduce((sum, row) => sum + row.opening.value, 0);
  const closingValue = orderedRows.reduce((sum, row) => sum + row.closing.value, 0);
  const glOpening = glLines.filter((line) => line.entry.occurredAt < from).reduce((sum, line) => sum + line.debit - line.credit, 0);
  const glMovement = glLines.filter((line) => line.entry.occurredAt >= from).reduce((sum, line) => sum + line.debit - line.credit, 0);
  const glClosing = glOpening + glMovement;
  const missingReversalQuantity = reversalCoverage.reduce(
    (sum, issue) => sum + issue.reversedQty - issue.reversals.reduce((covered, reversal) => covered + reversal.quantity, 0),
    0,
  );
  const incompleteTransfers = transfers.filter((movement) => movement.totalValue === null || movement.valuationQty === null).length;
  const incompleteSerializedReceipts = serializedReceipts.filter((movement) => movement.totalValue === null).length;
  const incompleteServiceConsumptions = serviceConsumptions.filter(
    (movement) => movement.totalValue === null || movement.valuationQty === null,
  ).length;
  const unknownIssueLocations = ownedIssues.filter((issue) => !issue.location || issue.location === 'UNKNOWN').length;
  const unknownReversalLocations = ownedReversals.filter((reversal) => reversal.location === 'UNKNOWN').length;
  const legacyConsignmentIssues = issues.length - ownedIssues.length;
  const incompleteQuantityBalances = quantityBalances.filter((balance) => {
    const consignmentQty = balance.quantityConsignmentLots.reduce(
      (sum, lot) => sum + lot.availableQty + lot.reservedQty,
      0,
    );
    const ownedPhysicalQty = balance.onHand - consignmentQty;
    const layerQty = balance.valuationLayers.reduce((sum, layer) => sum + layer.quantityRemaining, 0);
    const layerValue = balance.valuationLayers.reduce(
      (sum, layer) => sum + layer.quantityRemaining * layer.unitCost,
      0,
    );
    return ownedPhysicalQty < 0 || layerQty !== ownedPhysicalQty || layerValue !== balance.inventoryValue;
  }).length;
  const complete = missingReversalQuantity === 0
    && incompleteTransfers === 0
    && incompleteSerializedReceipts === 0
    && incompleteServiceConsumptions === 0
    && unknownIssueLocations === 0
    && unknownReversalLocations === 0
    && legacyConsignmentIssues === 0
    && incompleteQuantityBalances === 0;

  return {
    generatedAt: new Date().toISOString(),
    period: { from: from.toISOString(), to: to.toISOString(), semantics: '[from,to)' as const },
    scope: 'owned_inventory' as const,
    summary: {
      openingValue,
      closingValue,
      glOpening,
      glMovement,
      glClosing,
      openingDifference: openingValue - glOpening,
      closingDifference: closingValue - glClosing,
      missingReversalQuantity,
      incompleteTransfers,
      incompleteSerializedReceipts,
      incompleteServiceConsumptions,
      unknownIssueLocations,
      unknownReversalLocations,
      legacyConsignmentIssues,
      incompleteQuantityBalances,
      complete,
      consistent: closingValue === glClosing && openingValue === glOpening
        && complete,
    },
    rows: orderedRows,
  };
}
