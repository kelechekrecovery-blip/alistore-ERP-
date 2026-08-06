"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOrderInventorySnapshot = parseOrderInventorySnapshot;
exports.resolveOrderInventorySnapshot = resolveOrderInventorySnapshot;
exports.assertOrderLineSupplyReceived = assertOrderLineSupplyReceived;
exports.finalizeOrderInventorySaleOnTx = finalizeOrderInventorySaleOnTx;
exports.finalizeOrderItemInventorySaleOnTx = finalizeOrderItemInventorySaleOnTx;
exports.orderHasTrackedInventoryOnTx = orderHasTrackedInventoryOnTx;
exports.assertOrderReservationCoverageOnTx = assertOrderReservationCoverageOnTx;
exports.assertOrderInventoryFinalizedOnTx = assertOrderInventoryFinalizedOnTx;
exports.lockInventoryBalancesOnTx = lockInventoryBalancesOnTx;
const client_1 = require("@prisma/client");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const consignment_accounting_1 = require("./consignment-accounting");
const inventory_valuation_1 = require("./inventory-valuation");
function parseOrderInventorySnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    if (typeof record.productId !== 'string'
        || (record.trackingMode !== 'serialized' && record.trackingMode !== 'quantity')
        || !Array.isArray(record.components))
        return null;
    const components = record.components.map((component) => {
        if (!component || typeof component !== 'object' || Array.isArray(component))
            return null;
        const row = component;
        if (typeof row.productId !== 'string'
            || typeof row.sku !== 'string'
            || (row.trackingMode !== 'serialized' && row.trackingMode !== 'quantity')
            || typeof row.qty !== 'number'
            || !Number.isInteger(row.qty)
            || row.qty <= 0)
            return null;
        return { productId: row.productId, sku: row.sku, trackingMode: row.trackingMode, qty: row.qty };
    });
    if (components.some((component) => component === null))
        return null;
    return {
        productId: record.productId,
        trackingMode: record.trackingMode,
        components: components,
    };
}
function resolveOrderInventorySnapshot(value, fallback) {
    if (value === null)
        return fallback;
    const snapshot = parseOrderInventorySnapshot(value);
    if (!snapshot) {
        throw new errors_1.ConflictError('order_inventory_snapshot_invalid', 'Сохранённый складской снимок заказа повреждён');
    }
    return snapshot;
}
function assertOrderLineSupplyReceived(orderId, items, supplyByOrderItemId) {
    const blockedSkus = [...new Set(items
            .filter((item) => item.supplyModeSnapshot === 'to_order')
            .filter((item) => {
            const supply = supplyByOrderItemId.get(item.id);
            return supply?.status !== 'received' && supply?.status !== 'handed_over';
        })
            .map((item) => item.sku))];
    if (blockedSkus.length === 0)
        return;
    throw new errors_1.ConflictError('to_order_not_reservable', `Заказ ${orderId} содержит товар "под заказ" (${blockedSkus.join(', ')}), поставка которого ещё не получена от поставщика — резерв и продажа стока недоступны`);
}
async function finalizeOrderInventorySaleOnTx(tx, input) {
    const reservedUnits = await tx.reservation.findMany({
        where: { orderId: input.orderId, active: true, imei: { not: null } },
        select: { imei: true },
        orderBy: { imei: 'asc' },
    });
    for (const reservation of reservedUnits) {
        if (!reservation.imei)
            continue;
        const valuation = await input.units.sellOnTx(tx, reservation.imei, input.orderId, input.actor);
        if (valuation?.entry) {
            input.events.push({
                type: event_types_1.EventType.AccountingEntryPosted,
                actor: input.actor,
                payload: {
                    accountingEntryId: valuation.entry.id,
                    sourceType: 'inventory.cogs',
                    sourceRef: valuation.issue.id,
                    amount: valuation.issue.totalCost,
                },
                refs: [valuation.entry.id, valuation.issue.id, input.orderId, reservation.imei],
            });
        }
        input.events.push({
            type: event_types_1.EventType.UnitSold,
            actor: input.actor,
            payload: { orderId: input.orderId, imei: reservation.imei },
            refs: [input.orderId, reservation.imei],
        });
    }
    await (0, consignment_accounting_1.accrueConsignmentSalesOnTx)(tx, {
        orderId: input.orderId,
        imeis: reservedUnits.flatMap((reservation) => reservation.imei ? [reservation.imei] : []),
        actor: input.actor,
        events: input.events,
    });
    const quantityAllocations = await tx.orderQuantityAllocation.findMany({
        where: { orderId: input.orderId, active: true },
        orderBy: [{ balanceId: 'asc' }, { id: 'asc' }],
    });
    await lockInventoryBalancesOnTx(tx, quantityAllocations.map((allocation) => allocation.balanceId));
    for (const allocation of quantityAllocations) {
        const quantityConsignments = await tx.quantityConsignmentAllocation.findMany({
            where: { orderQuantityAllocationId: allocation.id, status: 'active' },
            select: { qty: true },
        });
        const consignedQty = quantityConsignments.reduce((sum, item) => sum + item.qty, 0);
        if (consignedQty > allocation.qty) {
            throw new errors_1.ConflictError('quantity_consignment_allocation_invalid', `Комиссионный резерв ${allocation.id} превышает продажу`);
        }
        const ownedQty = allocation.qty - consignedQty;
        const totalCost = ownedQty > 0
            ? await (0, inventory_valuation_1.consumeQuantityValuationOnTx)(tx, {
                orderId: input.orderId,
                allocationId: allocation.id,
                productId: allocation.productId,
                balanceId: allocation.balanceId,
                quantity: ownedQty,
                actor: input.actor,
            })
            : 0;
        const consumed = await tx.inventoryBalance.updateMany({
            where: {
                id: allocation.balanceId,
                onHand: { gte: allocation.qty },
                reserved: { gte: allocation.qty },
                inventoryValue: { gte: totalCost },
            },
            data: {
                onHand: { decrement: allocation.qty },
                reserved: { decrement: allocation.qty },
                inventoryValue: { decrement: totalCost },
            },
        });
        if (consumed.count !== 1) {
            throw new errors_1.ConflictError('quantity_allocation_invalid', `Резерв ${allocation.id} больше недоступен`);
        }
        await tx.orderQuantityAllocation.update({
            where: { id: allocation.id },
            data: { active: false, consumedAt: new Date() },
        });
        input.events.push({
            type: event_types_1.EventType.StockSold,
            actor: input.actor,
            payload: {
                orderId: input.orderId,
                sku: allocation.sku,
                qty: allocation.qty,
                allocationId: allocation.id,
            },
            refs: [input.orderId, allocation.productId, allocation.id],
        });
    }
    await (0, consignment_accounting_1.accrueQuantityConsignmentSalesOnTx)(tx, {
        orderId: input.orderId,
        orderQuantityAllocationIds: quantityAllocations.map((allocation) => allocation.id),
        actor: input.actor,
        events: input.events,
    });
    await tx.orderBundleAllocation.updateMany({
        where: { orderId: input.orderId, active: true },
        data: { active: false, consumedAt: new Date() },
    });
    await tx.reservation.updateMany({
        where: { orderId: input.orderId, active: true },
        data: { active: false },
    });
    return { serialized: reservedUnits.length, quantityAllocations: quantityAllocations.length };
}
async function finalizeOrderItemInventorySaleOnTx(tx, input) {
    const item = await tx.orderItem.findFirst({
        where: { id: input.orderItemId, orderId: input.orderId },
        select: { id: true, imei: true },
    });
    if (!item) {
        throw new errors_1.ConflictError('order_item_not_found', `Строка ${input.orderItemId} не найдена`);
    }
    const bundleAllocations = await tx.orderBundleAllocation.findMany({
        where: { orderId: input.orderId, orderItemId: input.orderItemId, active: true },
        orderBy: { imei: 'asc' },
    });
    const imeis = [...new Set([
            ...(item.imei ? [item.imei] : []),
            ...bundleAllocations.map((allocation) => allocation.imei),
        ])].sort();
    const reservations = imeis.length > 0
        ? await tx.reservation.findMany({
            where: { orderId: input.orderId, active: true, imei: { in: imeis } },
            select: { id: true, imei: true },
            orderBy: { imei: 'asc' },
        })
        : [];
    const reservedImeis = new Set(reservations.flatMap((reservation) => (reservation.imei ? [reservation.imei] : [])));
    if (imeis.some((imei) => !reservedImeis.has(imei))) {
        throw new errors_1.ConflictError('order_item_reservation_incomplete', `Серийный резерв строки ${input.orderItemId} неполон`);
    }
    for (const imei of imeis) {
        const valuation = await input.units.sellOnTx(tx, imei, input.orderId, input.actor);
        if (valuation?.entry) {
            input.events.push({
                type: event_types_1.EventType.AccountingEntryPosted,
                actor: input.actor,
                payload: {
                    accountingEntryId: valuation.entry.id,
                    sourceType: 'inventory.cogs',
                    sourceRef: valuation.issue.id,
                    amount: valuation.issue.totalCost,
                    orderItemId: input.orderItemId,
                },
                refs: [valuation.entry.id, valuation.issue.id, input.orderId, input.orderItemId, imei],
            });
        }
        input.events.push({
            type: event_types_1.EventType.UnitSold,
            actor: input.actor,
            payload: { orderId: input.orderId, orderItemId: input.orderItemId, imei },
            refs: [input.orderId, input.orderItemId, imei],
        });
    }
    await (0, consignment_accounting_1.accrueConsignmentSalesOnTx)(tx, {
        orderId: input.orderId,
        imeis,
        actor: input.actor,
        events: input.events,
    });
    const quantityAllocations = await tx.orderQuantityAllocation.findMany({
        where: { orderId: input.orderId, orderItemId: input.orderItemId, active: true },
        orderBy: [{ balanceId: 'asc' }, { id: 'asc' }],
    });
    const quantityAllocationIds = quantityAllocations.map((allocation) => allocation.id);
    const quantityReservations = quantityAllocationIds.length > 0
        ? await tx.reservation.findMany({
            where: {
                orderId: input.orderId,
                active: true,
                quantityAllocationId: { in: quantityAllocationIds },
            },
            select: { quantityAllocationId: true },
        })
        : [];
    const reservedQuantityAllocationIds = new Set(quantityReservations.flatMap((reservation) => (reservation.quantityAllocationId ? [reservation.quantityAllocationId] : [])));
    if (quantityAllocationIds.some((id) => !reservedQuantityAllocationIds.has(id))) {
        throw new errors_1.ConflictError('order_item_reservation_incomplete', `Количественный резерв строки ${input.orderItemId} неполон`);
    }
    await lockInventoryBalancesOnTx(tx, quantityAllocations.map((allocation) => allocation.balanceId));
    for (const allocation of quantityAllocations) {
        const quantityConsignments = await tx.quantityConsignmentAllocation.findMany({
            where: { orderQuantityAllocationId: allocation.id, status: 'active' },
            select: { qty: true },
        });
        const consignedQty = quantityConsignments.reduce((sum, row) => sum + row.qty, 0);
        if (consignedQty > allocation.qty) {
            throw new errors_1.ConflictError('quantity_consignment_allocation_invalid', `Комиссионный резерв ${allocation.id} превышает продажу`);
        }
        const ownedQty = allocation.qty - consignedQty;
        const totalCost = ownedQty > 0
            ? await (0, inventory_valuation_1.consumeQuantityValuationOnTx)(tx, {
                orderId: input.orderId,
                allocationId: allocation.id,
                productId: allocation.productId,
                balanceId: allocation.balanceId,
                quantity: ownedQty,
                actor: input.actor,
            })
            : 0;
        const consumed = await tx.inventoryBalance.updateMany({
            where: {
                id: allocation.balanceId,
                onHand: { gte: allocation.qty },
                reserved: { gte: allocation.qty },
                inventoryValue: { gte: totalCost },
            },
            data: {
                onHand: { decrement: allocation.qty },
                reserved: { decrement: allocation.qty },
                inventoryValue: { decrement: totalCost },
            },
        });
        if (consumed.count !== 1) {
            throw new errors_1.ConflictError('quantity_allocation_invalid', `Резерв ${allocation.id} больше недоступен`);
        }
        await tx.orderQuantityAllocation.update({
            where: { id: allocation.id },
            data: { active: false, consumedAt: new Date() },
        });
        input.events.push({
            type: event_types_1.EventType.StockSold,
            actor: input.actor,
            payload: {
                orderId: input.orderId,
                orderItemId: input.orderItemId,
                sku: allocation.sku,
                qty: allocation.qty,
                allocationId: allocation.id,
            },
            refs: [input.orderId, input.orderItemId, allocation.productId, allocation.id],
        });
    }
    await (0, consignment_accounting_1.accrueQuantityConsignmentSalesOnTx)(tx, {
        orderId: input.orderId,
        orderQuantityAllocationIds: quantityAllocations.map((allocation) => allocation.id),
        actor: input.actor,
        events: input.events,
    });
    await tx.orderBundleAllocation.updateMany({
        where: { orderId: input.orderId, orderItemId: input.orderItemId, active: true },
        data: { active: false, consumedAt: new Date() },
    });
    if (reservations.length > 0 || quantityAllocationIds.length > 0) {
        await tx.reservation.updateMany({
            where: {
                orderId: input.orderId,
                active: true,
                OR: [
                    ...(imeis.length > 0 ? [{ imei: { in: imeis } }] : []),
                    ...(quantityAllocationIds.length > 0
                        ? [{ quantityAllocationId: { in: quantityAllocationIds } }]
                        : []),
                ],
            },
            data: { active: false },
        });
    }
    return { serialized: imeis.length, quantityAllocations: quantityAllocations.length };
}
async function orderHasTrackedInventoryOnTx(tx, orderId) {
    const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { sku: true, inventorySnapshot: true },
    });
    if (items.length === 0)
        return false;
    for (const item of items) {
        if (item.inventorySnapshot !== null) {
            resolveOrderInventorySnapshot(item.inventorySnapshot, null);
            return true;
        }
    }
    const skus = [...new Set(items.map((item) => item.sku))];
    const products = await tx.product.findMany({ where: { sku: { in: skus } }, select: { sku: true } });
    return products.length > 0;
}
async function assertOrderReservationCoverageOnTx(tx, orderId, now = new Date(), options = {}) {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order)
        throw new errors_1.ConflictError('order_not_found', `Заказ ${orderId} не найден`);
    if (order.items.length === 0)
        return { serialized: 0, quantity: 0 };
    const products = await tx.product.findMany({
        where: { sku: { in: [...new Set(order.items.map((item) => item.sku))] } },
        include: { bundleComponents: { include: { componentProduct: true } } },
    });
    const productsBySku = new Map(products.map((product) => [product.sku, product]));
    const reservations = await tx.reservation.findMany({
        where: { orderId, active: true },
        include: { quantityAllocation: true },
    });
    if (options.enforceExpiry !== false && reservations.some((reservation) => reservation.expiresAt <= now)) {
        throw new errors_1.ConflictError('order_reservation_expired', 'Резерв заказа истёк; выполните резервирование повторно');
    }
    const liveImeis = new Set(reservations.flatMap((reservation) => reservation.imei ? [reservation.imei] : []));
    const bundleAllocations = await tx.orderBundleAllocation.findMany({ where: { orderId, active: true } });
    const serializedImeis = [...new Set([
            ...liveImeis,
            ...bundleAllocations.map((allocation) => allocation.imei),
        ])];
    const reservedUnits = serializedImeis.length > 0
        ? await tx.deviceUnit.findMany({
            where: { imei: { in: serializedImeis } },
            select: { imei: true, productId: true, status: true, orderId: true },
        })
        : [];
    const reservedUnitsByImei = new Map(reservedUnits.map((unit) => [unit.imei, unit]));
    const isReservedUnit = (imei, productId) => {
        const unit = reservedUnitsByImei.get(imei);
        return liveImeis.has(imei)
            && unit?.productId === productId
            && unit.status === 'reserved'
            && unit.orderId === orderId;
    };
    const expectedImeis = new Set();
    const expectedQuantityAllocationIds = new Set();
    const expectedBundleAllocationIds = new Set();
    let serialized = 0;
    let quantity = 0;
    const coverQuantity = (orderItemId, productId, required, sku) => {
        const matching = reservations.filter((reservation) => {
            const allocation = reservation.quantityAllocation;
            return allocation?.active && allocation.orderItemId === orderItemId && allocation.productId === productId;
        });
        if (matching.reduce((sum, reservation) => sum + (reservation.quantityAllocation?.qty ?? 0), 0) !== required) {
            throw incompleteReservation(orderId, sku);
        }
        for (const reservation of matching)
            expectedQuantityAllocationIds.add(reservation.quantityAllocation.id);
        quantity += required;
    };
    for (const item of order.items) {
        const product = productsBySku.get(item.sku);
        const snapshot = resolveOrderInventorySnapshot(item.inventorySnapshot, product ? {
            productId: product.id,
            trackingMode: product.trackingMode,
            components: product.bundleComponents.map((component) => ({
                productId: component.componentProductId,
                sku: component.componentProduct.sku,
                trackingMode: component.componentProduct.trackingMode,
                qty: component.qty,
            })),
        } : null);
        if (!snapshot)
            continue;
        if (snapshot.components.length > 0) {
            for (const component of snapshot.components) {
                const required = item.qty * component.qty;
                if (component.trackingMode === 'quantity') {
                    coverQuantity(item.id, component.productId, required, component.sku);
                    continue;
                }
                const matching = bundleAllocations
                    .filter((allocation) => allocation.orderItemId === item.id && allocation.componentProductId === component.productId);
                const allocatedImeis = matching.map((allocation) => allocation.imei);
                if (allocatedImeis.length !== required || allocatedImeis.some((imei) => !isReservedUnit(imei, component.productId))) {
                    throw incompleteReservation(orderId, component.sku);
                }
                for (const allocation of matching)
                    expectedBundleAllocationIds.add(allocation.id);
                for (const imei of allocatedImeis)
                    expectedImeis.add(imei);
                serialized += required;
            }
            continue;
        }
        if (snapshot.trackingMode === 'quantity') {
            coverQuantity(item.id, snapshot.productId, item.qty, item.sku);
            continue;
        }
        if (!item.imei || item.qty !== 1 || !isReservedUnit(item.imei, snapshot.productId)) {
            throw incompleteReservation(orderId, item.sku);
        }
        expectedImeis.add(item.imei);
        serialized += 1;
    }
    const exactReservations = reservations.every((reservation) => reservation.imei
        ? expectedImeis.has(reservation.imei)
        : Boolean(reservation.quantityAllocationId && expectedQuantityAllocationIds.has(reservation.quantityAllocationId)));
    if (!exactReservations
        || reservations.length !== expectedImeis.size + expectedQuantityAllocationIds.size
        || bundleAllocations.length !== expectedBundleAllocationIds.size) {
        throw incompleteReservation(orderId, 'inventory-footprint');
    }
    return { serialized, quantity };
}
async function assertOrderInventoryFinalizedOnTx(tx, orderId) {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order)
        throw new errors_1.ConflictError('order_not_found', `Заказ ${orderId} не найден`);
    if (order.items.length === 0)
        return;
    const products = await tx.product.findMany({
        where: { sku: { in: [...new Set(order.items.map((item) => item.sku))] } },
        include: { bundleComponents: { include: { componentProduct: true } } },
    });
    const productsBySku = new Map(products.map((product) => [product.sku, product]));
    const allocations = await tx.orderQuantityAllocation.findMany({
        where: { orderId, consumedAt: { not: null } },
        orderBy: [{ balanceId: 'asc' }, { id: 'asc' }],
    });
    const bundleAllocations = await tx.orderBundleAllocation.findMany({ where: { orderId, consumedAt: { not: null } } });
    const sold = await tx.deviceUnit.findMany({
        where: { orderId, status: 'sold' },
        select: {
            imei: true,
            productId: true,
            acquisitionCost: true,
            consignmentItem: {
                select: { id: true, status: true, saleOrderId: true, ownerAmount: true },
            },
        },
    });
    const valuationIssues = await tx.inventoryValuationIssue.findMany({
        where: { orderId },
        include: { layer: true },
    });
    const valuationEntries = valuationIssues.length > 0
        ? await tx.accountingJournalEntry.findMany({
            where: { sourceType: 'inventory.cogs', sourceRef: { in: valuationIssues.map((issue) => issue.id) } },
            include: { lines: true },
        })
        : [];
    const quantityConsignments = allocations.length > 0
        ? await tx.quantityConsignmentAllocation.findMany({
            where: { orderQuantityAllocationId: { in: allocations.map((allocation) => allocation.id) } },
        })
        : [];
    const consignmentRefs = [
        ...sold.flatMap((unit) => unit.consignmentItem ? [unit.consignmentItem.id] : []),
        ...quantityConsignments.map((allocation) => allocation.id),
    ];
    const consignmentEntries = consignmentRefs.length > 0
        ? await tx.accountingJournalEntry.findMany({
            where: {
                OR: [
                    { sourceType: 'consignment.sale', sourceRef: { in: consignmentRefs } },
                    { sourceType: 'quantity-consignment.sale', sourceRef: { in: consignmentRefs } },
                ],
            },
            include: { lines: true },
        })
        : [];
    const soldByImei = new Map(sold.map((unit) => [unit.imei, unit]));
    const expectedImeis = new Set();
    const expectedQuantityAllocationIds = new Set();
    const expectedBundleAllocationIds = new Set();
    const expectedIssueIds = new Set();
    const assertOwnedValuation = (issues, sku, expected) => {
        if (issues.length === 0)
            throw incompleteInventory(orderId, `${sku}:valuation`);
        if (issues.reduce((sum, issue) => sum + issue.quantity, 0) !== expected.quantity) {
            throw incompleteInventory(orderId, `${sku}:valuation-quantity`);
        }
        for (const issue of issues) {
            if (issue.sourceType !== 'sale'
                || issue.productId !== expected.productId
                || issue.quantity <= 0
                || issue.totalCost !== issue.quantity * issue.unitCost
                || (expected.unitCost !== undefined && issue.unitCost !== expected.unitCost)
                || (expected.balanceId !== undefined && (!issue.layer
                    || issue.layerId !== issue.layer.id
                    || issue.layer.balanceId !== expected.balanceId
                    || issue.layer.productId !== expected.productId
                    || issue.layer.unitCost !== issue.unitCost))) {
                throw incompleteInventory(orderId, `${sku}:valuation-source`);
            }
            expectedIssueIds.add(issue.id);
            assertExactAccounting(valuationEntries.filter((entry) => entry.sourceRef === issue.id), issue.totalCost, '5000', '1200', orderId, `${sku}:cogs`);
        }
    };
    const assertConsignment = (rows, sourceType, sku) => {
        for (const row of rows) {
            if (row.status !== 'sold' || row.saleOrderId !== orderId || row.ownerAmount === null) {
                throw incompleteInventory(orderId, `${sku}:consignment`);
            }
            assertExactAccounting(consignmentEntries.filter((entry) => entry.sourceType === sourceType && entry.sourceRef === row.id), row.ownerAmount, '4000', '2000', orderId, `${sku}:consignment-accounting`);
        }
    };
    const coverConsumedQuantity = (orderItemId, productId, required, sku) => {
        const matching = allocations.filter((allocation) => (allocation.orderItemId === orderItemId
            && allocation.productId === productId
            && !allocation.active
            && Boolean(allocation.consumedAt)));
        if (matching.reduce((sum, allocation) => sum + allocation.qty, 0) !== required) {
            throw incompleteInventory(orderId, sku);
        }
        for (const allocation of matching) {
            expectedQuantityAllocationIds.add(allocation.id);
            const consignments = quantityConsignments.filter((row) => row.orderQuantityAllocationId === allocation.id);
            const consignmentQty = consignments.reduce((sum, row) => sum + row.qty, 0);
            const issues = valuationIssues.filter((issue) => issue.sourceRef.startsWith(`${orderId}:${allocation.id}:`));
            if (consignmentQty > allocation.qty)
                throw incompleteInventory(orderId, `${sku}:consignment-quantity`);
            const ownedQty = allocation.qty - consignmentQty;
            if (consignmentQty > 0) {
                assertConsignment(consignments, 'quantity-consignment.sale', sku);
            }
            if (ownedQty > 0) {
                assertOwnedValuation(issues, sku, {
                    productId: allocation.productId,
                    quantity: ownedQty,
                    balanceId: allocation.balanceId,
                });
            }
            else if (issues.length > 0)
                throw incompleteInventory(orderId, `${sku}:valuation`);
        }
    };
    for (const item of order.items) {
        const product = productsBySku.get(item.sku);
        const snapshot = resolveOrderInventorySnapshot(item.inventorySnapshot, product ? {
            productId: product.id,
            trackingMode: product.trackingMode,
            components: product.bundleComponents.map((component) => ({
                productId: component.componentProductId,
                sku: component.componentProduct.sku,
                trackingMode: component.componentProduct.trackingMode,
                qty: component.qty,
            })),
        } : null);
        if (!snapshot)
            continue;
        if (snapshot.components.length > 0) {
            for (const component of snapshot.components) {
                const required = item.qty * component.qty;
                if (component.trackingMode === 'quantity') {
                    coverConsumedQuantity(item.id, component.productId, required, component.sku);
                }
                else {
                    const matching = bundleAllocations
                        .filter((allocation) => allocation.orderItemId === item.id && allocation.componentProductId === component.productId);
                    const imeis = matching.map((allocation) => allocation.imei);
                    if (imeis.length !== required
                        || imeis.some((imei) => soldByImei.get(imei)?.productId !== component.productId))
                        throw incompleteInventory(orderId, component.sku);
                    for (const allocation of matching)
                        expectedBundleAllocationIds.add(allocation.id);
                    for (const imei of imeis) {
                        const soldUnit = soldByImei.get(imei);
                        if (soldUnit.consignmentItem) {
                            if (valuationIssues.some((issue) => issue.imei === imei)) {
                                throw incompleteInventory(orderId, `${component.sku}:valuation`);
                            }
                            assertConsignment([soldUnit.consignmentItem], 'consignment.sale', component.sku);
                        }
                        else {
                            if (soldUnit.acquisitionCost === null)
                                throw incompleteInventory(orderId, `${component.sku}:acquisition-cost`);
                            assertOwnedValuation(valuationIssues.filter((issue) => issue.imei === imei && issue.sourceRef === `${orderId}:${imei}`), component.sku, {
                                productId: soldUnit.productId,
                                quantity: 1,
                                unitCost: soldUnit.acquisitionCost,
                            });
                        }
                        expectedImeis.add(imei);
                    }
                }
            }
        }
        else if (snapshot.trackingMode === 'quantity') {
            coverConsumedQuantity(item.id, snapshot.productId, item.qty, item.sku);
        }
        else {
            const soldUnit = item.imei ? soldByImei.get(item.imei) : undefined;
            if (!item.imei || item.qty !== 1 || soldUnit?.productId !== snapshot.productId) {
                throw incompleteInventory(orderId, item.sku);
            }
            if (soldUnit.consignmentItem) {
                const strayIssues = valuationIssues.filter((issue) => issue.imei === item.imei);
                if (strayIssues.length > 0)
                    throw incompleteInventory(orderId, `${item.sku}:valuation`);
                assertConsignment([soldUnit.consignmentItem], 'consignment.sale', item.sku);
            }
            else {
                if (soldUnit.acquisitionCost === null)
                    throw incompleteInventory(orderId, `${item.sku}:acquisition-cost`);
                assertOwnedValuation(valuationIssues.filter((issue) => issue.imei === item.imei && issue.sourceRef === `${orderId}:${item.imei}`), item.sku, {
                    productId: soldUnit.productId,
                    quantity: 1,
                    unitCost: soldUnit.acquisitionCost,
                });
            }
            expectedImeis.add(item.imei);
        }
    }
    if (allocations.length !== expectedQuantityAllocationIds.size || bundleAllocations.length !== expectedBundleAllocationIds.size) {
        throw incompleteInventory(orderId, 'inventory-footprint');
    }
    if (sold.length !== expectedImeis.size || sold.some((unit) => !expectedImeis.has(unit.imei))) {
        throw incompleteInventory(orderId, 'serialized');
    }
    if (valuationIssues.length !== expectedIssueIds.size || valuationIssues.some((issue) => !expectedIssueIds.has(issue.id))) {
        throw incompleteInventory(orderId, 'valuation-footprint');
    }
}
function assertExactAccounting(entries, amount, debitAccount, creditAccount, orderId, label) {
    if (amount === 0) {
        if (entries.length !== 0)
            throw incompleteInventory(orderId, label);
        return;
    }
    if (amount < 0 || entries.length !== 1)
        throw incompleteInventory(orderId, label);
    const lines = entries[0].lines;
    const debit = lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = lines.reduce((sum, line) => sum + line.credit, 0);
    const exactDebit = lines.filter((line) => line.accountCode === debitAccount).reduce((sum, line) => sum + line.debit, 0);
    const exactCredit = lines.filter((line) => line.accountCode === creditAccount).reduce((sum, line) => sum + line.credit, 0);
    if (debit !== amount || credit !== amount || exactDebit !== amount || exactCredit !== amount) {
        throw incompleteInventory(orderId, label);
    }
}
async function lockInventoryBalancesOnTx(tx, balanceIds) {
    const ids = [...new Set(balanceIds)].sort();
    if (ids.length === 0)
        return;
    await tx.$queryRaw(client_1.Prisma.sql `
    SELECT id
    FROM "InventoryBalance"
    WHERE id IN (${client_1.Prisma.join(ids)})
    ORDER BY id
    FOR UPDATE
  `);
}
function incompleteReservation(orderId, sku) {
    return new errors_1.ConflictError('order_reservation_incomplete', `Резерв заказа ${orderId} не покрывает ${sku}. Зарезервируйте сток: POST /orders/${orderId}/reserve`);
}
function incompleteInventory(orderId, sku) {
    return new errors_1.ConflictError('order_inventory_unfinalized', `Складское списание заказа ${orderId} не покрывает ${sku}`);
}
//# sourceMappingURL=order-inventory-sale.js.map