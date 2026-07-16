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

type RawAggregate = {
  productId: string;
  location: string;
  bucket: Bucket;
  openingQty: bigint | number;
  openingValue: bigint | number;
  periodQty: bigint | number;
  periodValue: bigint | number;
};

const numeric = (value: unknown) => Number(value ?? 0);

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
  // Prisma DateTime columns are timestamp without time zone; bind the same UTC wall-clock value used by Prisma.
  const dbFrom = from.toISOString().slice(0, -1);
  const dbTo = to.toISOString().slice(0, -1);

  const [layerAggregates, issueAggregates, reversalAggregates, transferAggregates, serializedReceiptAggregates,
    incompleteTransferCount, incompleteSerializedReceiptCount, incompleteServiceConsumptionCount,
    missingReversalQuantityRows, unknownIssueLocationCount, unknownReversalLocationCount, legacyConsignmentIssueCount,
    incompleteQuantityBalanceCount, glTotals] = await Promise.all([
    prisma.$queryRaw<RawAggregate[]>`
      SELECT "productId", "location",
        CASE WHEN "sourceType" = 'inventory.adjustment' THEN 'adjustmentsIn' ELSE 'receipts' END::text AS bucket,
        COALESCE(SUM(CASE WHEN "createdAt" < ${dbFrom}::timestamp THEN "quantityReceived" ELSE 0 END), 0)::bigint AS "openingQty",
        COALESCE(SUM(CASE WHEN "createdAt" < ${dbFrom}::timestamp THEN "quantityReceived" * "unitCost" ELSE 0 END), 0)::bigint AS "openingValue",
        COALESCE(SUM(CASE WHEN "createdAt" >= ${dbFrom}::timestamp THEN "quantityReceived" ELSE 0 END), 0)::bigint AS "periodQty",
        COALESCE(SUM(CASE WHEN "createdAt" >= ${dbFrom}::timestamp THEN "quantityReceived" * "unitCost" ELSE 0 END), 0)::bigint AS "periodValue"
      FROM "InventoryValuationLayer"
      WHERE "createdAt" < ${dbTo}::timestamp AND "sourceType" NOT IN ('inventory.transfer', 'inventory.return')
      GROUP BY "productId", "location", "sourceType"
    `,
    prisma.$queryRaw<RawAggregate[]>`
      SELECT issue."productId", COALESCE(issue."location", 'UNKNOWN') AS location,
        CASE WHEN issue."sourceType" = 'sale' THEN 'issues' ELSE 'adjustmentsOut' END::text AS bucket,
        COALESCE(SUM(CASE WHEN issue."createdAt" < ${dbFrom}::timestamp THEN issue."quantity" ELSE 0 END), 0)::bigint AS "openingQty",
        COALESCE(SUM(CASE WHEN issue."createdAt" < ${dbFrom}::timestamp THEN issue."totalCost" ELSE 0 END), 0)::bigint AS "openingValue",
        COALESCE(SUM(CASE WHEN issue."createdAt" >= ${dbFrom}::timestamp THEN issue."quantity" ELSE 0 END), 0)::bigint AS "periodQty",
        COALESCE(SUM(CASE WHEN issue."createdAt" >= ${dbFrom}::timestamp THEN issue."totalCost" ELSE 0 END), 0)::bigint AS "periodValue"
      FROM "InventoryValuationIssue" issue
      LEFT JOIN "DeviceUnit" unit ON unit."imei" = issue."imei"
      LEFT JOIN "ConsignmentItem" consignment ON consignment."unitId" = unit."id"
      WHERE issue."createdAt" < ${dbTo}::timestamp AND consignment."id" IS NULL
      GROUP BY issue."productId", COALESCE(issue."location", 'UNKNOWN'), issue."sourceType"
    `,
    prisma.$queryRaw<RawAggregate[]>`
      SELECT reversal."productId", reversal."location", 'returns'::text AS bucket,
        COALESCE(SUM(CASE WHEN reversal."createdAt" < ${dbFrom}::timestamp THEN reversal."quantity" ELSE 0 END), 0)::bigint AS "openingQty",
        COALESCE(SUM(CASE WHEN reversal."createdAt" < ${dbFrom}::timestamp THEN reversal."totalCost" ELSE 0 END), 0)::bigint AS "openingValue",
        COALESCE(SUM(CASE WHEN reversal."createdAt" >= ${dbFrom}::timestamp THEN reversal."quantity" ELSE 0 END), 0)::bigint AS "periodQty",
        COALESCE(SUM(CASE WHEN reversal."createdAt" >= ${dbFrom}::timestamp THEN reversal."totalCost" ELSE 0 END), 0)::bigint AS "periodValue"
      FROM "InventoryValuationReversal" reversal
      JOIN "InventoryValuationIssue" issue ON issue."id" = reversal."issueId"
      LEFT JOIN "DeviceUnit" unit ON unit."imei" = issue."imei"
      LEFT JOIN "ConsignmentItem" consignment ON consignment."unitId" = unit."id"
      WHERE reversal."createdAt" < ${dbTo}::timestamp AND consignment."id" IS NULL
      GROUP BY reversal."productId", reversal."location"
    `,
    prisma.$queryRaw<RawAggregate[]>`
      SELECT "productId", "from" AS location, 'transferOut'::text AS bucket,
        COALESCE(SUM(CASE WHEN "createdAt" < ${dbFrom}::timestamp THEN COALESCE("valuationQty", 0) ELSE 0 END), 0)::bigint AS "openingQty",
        COALESCE(SUM(CASE WHEN "createdAt" < ${dbFrom}::timestamp THEN COALESCE("totalValue", 0) ELSE 0 END), 0)::bigint AS "openingValue",
        COALESCE(SUM(CASE WHEN "createdAt" >= ${dbFrom}::timestamp THEN COALESCE("valuationQty", 0) ELSE 0 END), 0)::bigint AS "periodQty",
        COALESCE(SUM(CASE WHEN "createdAt" >= ${dbFrom}::timestamp THEN COALESCE("totalValue", 0) ELSE 0 END), 0)::bigint AS "periodValue"
      FROM "InventoryMovement"
      WHERE "type" = 'moved' AND "from" IS NOT NULL AND "createdAt" < ${dbTo}::timestamp
      GROUP BY "productId", "from"
      UNION ALL
      SELECT "productId", "to" AS location, 'transferIn'::text AS bucket,
        COALESCE(SUM(CASE WHEN "createdAt" < ${dbFrom}::timestamp THEN COALESCE("valuationQty", 0) ELSE 0 END), 0)::bigint AS "openingQty",
        COALESCE(SUM(CASE WHEN "createdAt" < ${dbFrom}::timestamp THEN COALESCE("totalValue", 0) ELSE 0 END), 0)::bigint AS "openingValue",
        COALESCE(SUM(CASE WHEN "createdAt" >= ${dbFrom}::timestamp THEN COALESCE("valuationQty", 0) ELSE 0 END), 0)::bigint AS "periodQty",
        COALESCE(SUM(CASE WHEN "createdAt" >= ${dbFrom}::timestamp THEN COALESCE("totalValue", 0) ELSE 0 END), 0)::bigint AS "periodValue"
      FROM "InventoryMovement"
      WHERE "type" = 'moved' AND "to" IS NOT NULL AND "createdAt" < ${dbTo}::timestamp
      GROUP BY "productId", "to"
    `,
    prisma.$queryRaw<RawAggregate[]>`
      SELECT movement."productId", movement."to" AS location, 'receipts'::text AS bucket,
        COALESCE(SUM(CASE WHEN movement."createdAt" < ${dbFrom}::timestamp THEN movement."qty" ELSE 0 END), 0)::bigint AS "openingQty",
        COALESCE(SUM(CASE WHEN movement."createdAt" < ${dbFrom}::timestamp THEN COALESCE(movement."totalValue", 0) ELSE 0 END), 0)::bigint AS "openingValue",
        COALESCE(SUM(CASE WHEN movement."createdAt" >= ${dbFrom}::timestamp THEN movement."qty" ELSE 0 END), 0)::bigint AS "periodQty",
        COALESCE(SUM(CASE WHEN movement."createdAt" >= ${dbFrom}::timestamp THEN COALESCE(movement."totalValue", 0) ELSE 0 END), 0)::bigint AS "periodValue"
      FROM "InventoryMovement" movement
      JOIN "Product" product ON product."id" = movement."productId"
      WHERE movement."type" = 'received' AND movement."to" IS NOT NULL
        AND movement."createdAt" < ${dbTo}::timestamp AND product."trackingMode" = 'serialized'
      GROUP BY movement."productId", movement."to"
    `,
    prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count FROM "InventoryMovement"
      WHERE "type" = 'moved' AND "createdAt" < ${dbTo}::timestamp AND ("totalValue" IS NULL OR "valuationQty" IS NULL)
    `,
    prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count FROM "InventoryMovement" movement
      JOIN "Product" product ON product."id" = movement."productId"
      WHERE movement."type" = 'received' AND movement."createdAt" < ${dbTo}::timestamp
        AND product."trackingMode" = 'serialized' AND movement."totalValue" IS NULL
    `,
    prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count FROM "InventoryMovement"
      WHERE "type" = 'service_consumed' AND "createdAt" < ${dbTo}::timestamp
        AND ("totalValue" IS NULL OR "valuationQty" IS NULL)
    `,
    prisma.$queryRaw<Array<{ quantity: bigint | number }>>`
      SELECT COALESCE(SUM(issue."reversedQty" - COALESCE(reversal_totals."quantity", 0)), 0)::bigint AS quantity
      FROM "InventoryValuationIssue" issue
      LEFT JOIN (
        SELECT "issueId", SUM("quantity")::bigint AS quantity
        FROM "InventoryValuationReversal"
        GROUP BY "issueId"
      ) reversal_totals ON reversal_totals."issueId" = issue."id"
      WHERE issue."reversedQty" > 0 AND issue."createdAt" < ${dbTo}::timestamp
    `,
    prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count FROM "InventoryValuationIssue" issue
      LEFT JOIN "DeviceUnit" unit ON unit."imei" = issue."imei"
      LEFT JOIN "ConsignmentItem" consignment ON consignment."unitId" = unit."id"
      WHERE issue."createdAt" < ${dbTo}::timestamp AND consignment."id" IS NULL
        AND (issue."location" IS NULL OR issue."location" = 'UNKNOWN')
    `,
    prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count FROM "InventoryValuationReversal" reversal
      JOIN "InventoryValuationIssue" issue ON issue."id" = reversal."issueId"
      LEFT JOIN "DeviceUnit" unit ON unit."imei" = issue."imei"
      LEFT JOIN "ConsignmentItem" consignment ON consignment."unitId" = unit."id"
      WHERE reversal."createdAt" < ${dbTo}::timestamp AND consignment."id" IS NULL AND reversal."location" = 'UNKNOWN'
    `,
    prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count FROM "InventoryValuationIssue" issue
      LEFT JOIN "DeviceUnit" unit ON unit."imei" = issue."imei"
      LEFT JOIN "ConsignmentItem" consignment ON consignment."unitId" = unit."id"
      WHERE issue."createdAt" < ${dbTo}::timestamp AND consignment."id" IS NOT NULL
    `,
    prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT balance."id"
        FROM "InventoryBalance" balance
        JOIN "Product" product ON product."id" = balance."productId"
        LEFT JOIN (
          SELECT "balanceId", SUM("quantityRemaining")::bigint AS quantity,
            SUM("quantityRemaining" * "unitCost")::bigint AS value
          FROM "InventoryValuationLayer"
          WHERE "quantityRemaining" > 0
          GROUP BY "balanceId"
        ) layers ON layers."balanceId" = balance."id"
        LEFT JOIN (
          SELECT "balanceId", SUM("availableQty" + "reservedQty")::bigint AS quantity
          FROM "QuantityConsignmentLot"
          GROUP BY "balanceId"
        ) consignment ON consignment."balanceId" = balance."id"
        WHERE product."trackingMode" = 'quantity'
          AND (
            balance."onHand" - COALESCE(consignment.quantity, 0) < 0
            OR COALESCE(layers.quantity, 0) <> balance."onHand" - COALESCE(consignment.quantity, 0)
            OR COALESCE(layers.value, 0) <> balance."inventoryValue"
          )
      ) inconsistent
    `,
    prisma.$queryRaw<Array<{ opening: bigint | number; movement: bigint | number }>>`
      SELECT
        COALESCE(SUM(CASE WHEN entry."occurredAt" < ${dbFrom}::timestamp THEN line."debit" - line."credit" ELSE 0 END), 0)::bigint AS opening,
        COALESCE(SUM(CASE WHEN entry."occurredAt" >= ${dbFrom}::timestamp THEN line."debit" - line."credit" ELSE 0 END), 0)::bigint AS movement
      FROM "AccountingJournalLine" line
      JOIN "AccountingJournalEntry" entry ON entry."id" = line."entryId"
      WHERE line."accountCode" = '1200' AND entry."occurredAt" < ${dbTo}::timestamp
    `,
  ]);

  const aggregates = [
    ...layerAggregates,
    ...issueAggregates,
    ...reversalAggregates,
    ...transferAggregates,
    ...serializedReceiptAggregates,
  ];
  const productIds = [...new Set(aggregates.map((aggregate) => aggregate.productId))];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, name: true } })
    : [];
  const productsById = new Map(products.map((product) => [product.id, product]));

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
  for (const aggregate of aggregates) {
    const product = productsById.get(aggregate.productId);
    if (!product || !aggregate.location) continue;
    const row = getRow(product.id, product.sku, product.name, aggregate.location);
    const openingSign = aggregate.bucket === 'issues' || aggregate.bucket === 'transferOut' || aggregate.bucket === 'adjustmentsOut' ? -1 : 1;
    row.opening.quantity += openingSign * numeric(aggregate.openingQty);
    row.opening.value += openingSign * numeric(aggregate.openingValue);
    row[aggregate.bucket].quantity += numeric(aggregate.periodQty);
    row[aggregate.bucket].value += numeric(aggregate.periodValue);
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
  const glOpening = numeric(glTotals[0]?.opening);
  const glMovement = numeric(glTotals[0]?.movement);
  const glClosing = glOpening + glMovement;
  const missingReversalQuantity = numeric(missingReversalQuantityRows[0]?.quantity);
  const incompleteTransfers = numeric(incompleteTransferCount[0]?.count);
  const incompleteSerializedReceipts = numeric(incompleteSerializedReceiptCount[0]?.count);
  const incompleteServiceConsumptions = numeric(incompleteServiceConsumptionCount[0]?.count);
  const unknownIssueLocations = numeric(unknownIssueLocationCount[0]?.count);
  const unknownReversalLocations = numeric(unknownReversalLocationCount[0]?.count);
  const legacyConsignmentIssues = numeric(legacyConsignmentIssueCount[0]?.count);
  const incompleteQuantityBalances = numeric(incompleteQuantityBalanceCount[0]?.count);
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
