"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handOverReadyOrderItemOnTx = handOverReadyOrderItemOnTx;
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const accounting_journal_1 = require("../finance/accounting-journal");
const order_inventory_sale_1 = require("../inventory/order-inventory-sale");
async function handOverReadyOrderItemOnTx(tx, input) {
    const item = await tx.orderItem.findFirst({
        where: { id: input.orderItemId, orderId: input.orderId },
        include: {
            product: { select: { trackingMode: true } },
            orderLineSupply: { include: { quantityAllocations: { where: { active: true }, orderBy: { createdAt: 'asc' } } } },
            receivables: { include: { allocations: true } },
        },
    });
    if (!item)
        throw new errors_1.ValidationError('order_item_not_found', `Строка ${input.orderItemId} не найдена`);
    if (item.fulfillmentStatus === 'handed_over') {
        throw new errors_1.ConflictError('order_item_already_handed_over', 'Строка уже выдана');
    }
    if (item.fulfillmentStatus !== 'ready') {
        throw new errors_1.ConflictError('order_item_not_ready', `Строка ${item.id} не готова к выдаче`);
    }
    const relevantKinds = item.supplyModeSnapshot === 'to_order'
        ? ['supply_deposit', 'supply_balance']
        : ['stock_sale'];
    const receivables = item.receivables.filter((row) => relevantKinds.includes(row.kind));
    if (item.supplyModeSnapshot === 'own_stock' && receivables.length !== 1) {
        throw new errors_1.ConflictError('stock_sale_receivable_missing', 'Для складской строки требуется одно начисление stock_sale');
    }
    if (item.supplyModeSnapshot === 'to_order') {
        if (item.orderLineSupply?.status !== 'ready') {
            throw new errors_1.ConflictError('order_line_supply_not_ready', 'Поставочная строка не готова к выдаче');
        }
        const deposit = receivables.find((row) => row.kind === 'supply_deposit');
        if (!deposit || deposit.status !== 'settled') {
            throw new errors_1.ConflictError('order_line_deposit_unpaid', 'Задаток поставочной строки не закрыт');
        }
    }
    if (input.paymentMode !== 'cod' && receivables.some((row) => row.status !== 'settled')) {
        throw new errors_1.ConflictError('order_line_receivables_unpaid', 'Перед выдачей необходимо закрыть начисления строки');
    }
    const netSale = item.price * item.qty - item.discountAmount;
    if (item.taxBaseAmount + item.taxAmount !== netSale) {
        throw new errors_1.ConflictError('order_line_financial_snapshot_invalid', 'Налоговый снимок строки не совпадает с суммой продажи');
    }
    const receivableTotal = receivables.reduce((sum, row) => sum + row.amount, 0);
    if (receivableTotal !== netSale) {
        throw new errors_1.ConflictError('order_line_receivable_total_invalid', 'Начисления строки не совпадают с суммой продажи');
    }
    const liability = receivables.reduce((sum, row) => sum + row.allocations.reduce((allocated, allocation) => allocated + allocation.amount, 0), 0);
    if (liability > netSale || (input.paymentMode !== 'cod' && liability !== netSale)) {
        throw new errors_1.ConflictError('order_line_payment_allocation_incomplete', 'Платёжные аллокации строки повреждены');
    }
    const codReceivable = netSale - liability;
    const occurredAt = input.occurredAt ?? new Date();
    if (item.supplyModeSnapshot === 'own_stock') {
        await (0, order_inventory_sale_1.finalizeOrderItemInventorySaleOnTx)(tx, {
            orderId: input.orderId,
            orderItemId: item.id,
            actor: input.actor,
            units: input.units,
            events: input.events,
        });
    }
    else if (item.product?.trackingMode === 'serialized') {
        const units = await tx.deviceUnit.findMany({
            where: {
                orderId: input.orderId,
                productId: item.productId,
                status: 'reserved',
                ...(item.imei ? { imei: item.imei } : {}),
            },
            orderBy: { imei: 'asc' },
        });
        if (units.length !== item.qty) {
            throw new errors_1.ConflictError('order_line_reserved_units_incomplete', 'Серийные единицы поставочной строки не совпадают с количеством');
        }
        for (const unit of units) {
            const valuation = await input.units.sellOnTx(tx, unit.imei, input.orderId, input.actor);
            if (valuation?.entry)
                input.events.push({
                    type: event_types_1.EventType.AccountingEntryPosted,
                    actor: input.actor,
                    payload: { accountingEntryId: valuation.entry.id, sourceType: 'inventory.cogs', orderItemId: item.id },
                    refs: [valuation.entry.id, valuation.issue.id, input.orderId, item.id, unit.imei],
                });
        }
    }
    else {
        const allocations = item.orderLineSupply?.quantityAllocations ?? [];
        if (allocations.reduce((sum, allocation) => sum + allocation.qty, 0) !== item.qty) {
            throw new errors_1.ConflictError('supply_quantity_inventory_allocation_missing', 'Количественная поставка не имеет складской аллокации');
        }
        for (const allocation of allocations) {
            const issue = await tx.inventoryValuationIssue.create({
                data: {
                    productId: allocation.productId,
                    orderId: input.orderId,
                    sourceType: 'supply-quantity.sale',
                    sourceRef: allocation.id,
                    location: allocation.location,
                    quantity: allocation.qty,
                    unitCost: allocation.unitCost,
                    totalCost: allocation.qty * allocation.unitCost,
                },
            });
            const totalCost = allocation.qty * allocation.unitCost;
            const cogsEntry = totalCost > 0
                ? await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                    idempotencyKey: `accounting:supply-quantity.sale:${allocation.id}`,
                    sourceType: 'inventory.cogs',
                    sourceRef: issue.id,
                    description: `Себестоимость поставочного количества строки ${item.id}`,
                    point: allocation.location,
                    occurredAt,
                    createdBy: input.actor,
                    lines: [
                        { accountCode: '5000', debit: allocation.qty * allocation.unitCost, memo: 'Себестоимость выданного товара под заказ' },
                        { accountCode: '1200', credit: allocation.qty * allocation.unitCost, memo: 'Выбытие клиентской поставочной аллокации' },
                    ],
                })
                : null;
            const allocationCas = await tx.supplyQuantityAllocation.updateMany({
                where: { id: allocation.id, active: true, valuationIssueId: null },
                data: { active: false, consumedAt: occurredAt, valuationIssueId: issue.id },
            });
            if (allocationCas.count !== 1) {
                throw new errors_1.ConflictError('supply_quantity_allocation_race', 'Поставочная аллокация изменилась параллельно');
            }
            if (cogsEntry) {
                input.events.push({
                    type: event_types_1.EventType.AccountingEntryPosted,
                    actor: input.actor,
                    payload: {
                        accountingEntryId: cogsEntry.id,
                        sourceType: 'inventory.cogs',
                        orderItemId: item.id,
                        supplyQuantityAllocationId: allocation.id,
                    },
                    refs: [cogsEntry.id, issue.id, allocation.id, input.orderId, item.id],
                });
            }
        }
    }
    const sourceType = item.supplyModeSnapshot === 'to_order' ? 'order_line.handover' : 'order_item.handover';
    const accountingEntry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
        idempotencyKey: `accounting:${sourceType}:${item.id}`,
        sourceType,
        sourceRef: item.id,
        description: `Признание выручки при выдаче строки ${item.id}`,
        documentAmount: netSale,
        baseAmount: netSale,
        taxCode: item.taxCode,
        taxRateBps: item.taxRateBps,
        taxAmount: item.taxAmount,
        occurredAt,
        createdBy: input.actor,
        lines: [
            ...(liability > 0 ? [{ accountCode: '2400', debit: liability, memo: 'Погашение обязательства по предоплате' }] : []),
            ...(codReceivable > 0 ? [{ accountCode: '1100', debit: codReceivable, memo: 'Дебиторская задолженность COD по строке' }] : []),
            ...(item.taxBaseAmount > 0 ? [{ accountCode: '4000', credit: item.taxBaseAmount, memo: 'Выручка при фактической выдаче' }] : []),
            ...(item.taxAmount > 0 ? [{ accountCode: '2200', credit: item.taxAmount, memo: 'Исходящий НДС при выдаче' }] : []),
        ],
    });
    const itemCas = await tx.orderItem.updateMany({
        where: { id: item.id, fulfillmentStatus: 'ready' },
        data: { fulfillmentStatus: 'handed_over', handedOverAt: occurredAt },
    });
    if (itemCas.count !== 1)
        throw new errors_1.ConflictError('order_item_handover_race', 'Строка изменилась параллельно');
    if (item.orderLineSupply) {
        const supplyCas = await tx.orderLineSupply.updateMany({
            where: { id: item.orderLineSupply.id, status: 'ready' },
            data: { status: 'handed_over', actor: input.actor },
        });
        if (supplyCas.count !== 1)
            throw new errors_1.ConflictError('order_line_supply_race', 'Поставка изменилась параллельно');
    }
    input.events.push({
        type: event_types_1.EventType.AccountingEntryPosted,
        actor: input.actor,
        payload: { accountingEntryId: accountingEntry.id, sourceType, sourceRef: item.id, liability, codReceivable },
        refs: [accountingEntry.id, input.orderId, item.id],
    }, {
        type: item.supplyModeSnapshot === 'to_order' ? event_types_1.EventType.OrderLineSupplyHandedOver : event_types_1.EventType.OrderItemHandedOver,
        actor: input.actor,
        payload: { orderId: input.orderId, orderItemId: item.id, occurredAt: occurredAt.toISOString() },
        refs: [input.orderId, item.id],
    });
    return {
        item: await tx.orderItem.findUniqueOrThrow({ where: { id: item.id } }),
        accountingEntry,
        liability,
        codReceivable,
    };
}
//# sourceMappingURL=order-item-handover-on-tx.js.map