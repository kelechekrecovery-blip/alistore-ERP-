"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourierService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const courier_handover_1 = require("./courier-handover");
const accounting_journal_1 = require("../finance/accounting-journal");
const cash_drawer_1 = require("../shifts/cash-drawer");
const units_service_1 = require("../units/units.service");
const order_inventory_sale_1 = require("../inventory/order-inventory-sale");
const prisma_errors_1 = require("../common/prisma-errors");
const order_item_handover_on_tx_1 = require("../orders/order-item-handover-on-tx");
const ASSIGNABLE_STATUSES = ['paid', 'packed'];
const REMOVABLE_FROM_RUN_STATUSES = ['courier_assigned', 'out_for_delivery'];
const SETTLED_PAYMENT_STATUSES = new Set(['received', 'reconciled']);
let CourierService = class CourierService {
    constructor(prisma, audit, outbox, units) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
        this.units = units;
    }
    listMine(courierId) {
        return this.prisma.order.findMany({
            where: { courierId, status: { in: ['courier_assigned', 'out_for_delivery', 'delivered'] } },
            include: {
                items: true,
                payments: { select: { amount: true, status: true } },
                customer: { select: { name: true, phone: true } },
                courierRun: { select: { id: true, codTotal: true, collectedTotal: true, handedOver: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    async assertAssignedCourier(orderId, courierId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { courierId: true },
        });
        if (!order)
            throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
        if (order.courierId !== courierId) {
            throw new errors_1.ForbiddenError('delivery_forbidden', 'Доставка назначена другому курьеру');
        }
    }
    async getRun(id, expectedCourierId) {
        const run = await this.prisma.courierRun.findUnique({ where: { id }, include: { orders: true } });
        if (run && expectedCourierId && run.courierId !== expectedCourierId) {
            throw new errors_1.ForbiddenError('courier_run_forbidden', 'Рейс назначен другому курьеру');
        }
        return run;
    }
    async createRun(dto, actor, idempotencyKey) {
        const key = requireIdempotencyKey(idempotencyKey);
        return this.audit.transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${'courier-run-key:' + key}))`;
            const existing = await tx.courierRun.findUnique({
                where: { assignmentIdempotencyKey: key },
                include: { orders: { select: { id: true } } },
            });
            if (existing)
                return { result: replayRunAssignment(existing, dto), events: [] };
            const courier = await tx.staffUser.findUnique({ where: { id: dto.courierId } });
            if (!courier || !courier.active || courier.role !== 'courier') {
                throw new errors_1.ValidationError('courier_not_available', 'Нужен активный сотрудник с ролью courier');
            }
            const orderIds = [...new Set(dto.orderIds ?? [])].sort();
            if (orderIds.length > 0) {
                await tx.$queryRaw(client_1.Prisma.sql `
          SELECT id
          FROM "Order"
          WHERE id IN (${client_1.Prisma.join(orderIds)})
          ORDER BY id
          FOR UPDATE
        `);
            }
            const orders = orderIds.length > 0
                ? await tx.order.findMany({
                    where: { id: { in: orderIds } },
                    include: {
                        payments: true,
                        items: { select: { id: true, supplyModeSnapshot: true, fulfillmentStatus: true } },
                        receivables: { select: { kind: true, status: true, amount: true, settledAmount: true } },
                    },
                    orderBy: { id: 'asc' },
                })
                : [];
            if (orders.length !== orderIds.length) {
                throw new errors_1.ValidationError('order_not_found', 'Один или несколько заказов доставки не найдены');
            }
            for (const order of orders) {
                if (order.isDemo)
                    throw new errors_1.ValidationError('demo_order_blocked', 'Демо-заказ нельзя передать в доставку');
                if (order.fulfillmentType !== 'courier') {
                    throw new errors_1.ValidationError('courier_fulfillment_required', `Заказ ${order.id} не является доставкой`);
                }
                if (!ASSIGNABLE_STATUSES.includes(order.status)) {
                    throw new errors_1.ConflictError('order_not_assignable', `Заказ ${order.id} нельзя назначить из статуса ${order.status}`);
                }
                assertCourierLifecycleReady(order);
                if (order.paymentMode !== 'cod' && outstandingAmount(order) > 0) {
                    throw new errors_1.ConflictError('order_payment_unsettled', `Предоплаченный заказ ${order.id} нельзя назначить до полной оплаты`);
                }
            }
            const serverCod = orders.reduce((sum, order) => sum + outstandingAmount(order), 0);
            if (orders.length > 0 && dto.codTotal !== serverCod) {
                throw new errors_1.ValidationError('cod_total_mismatch', `Ожидаемый COD по выбранным заказам: ${serverCod}`);
            }
            const run = await tx.courierRun.create({
                data: {
                    assignmentIdempotencyKey: key,
                    courierId: dto.courierId,
                    codTotal: orders.length > 0 ? serverCod : dto.codTotal,
                    collectedTotal: orders.length > 0 ? 0 : dto.codTotal,
                },
            });
            const events = [{
                    type: event_types_1.EventType.DeliveryAssigned,
                    actor,
                    payload: { runId: run.id, courierId: dto.courierId, codTotal: run.codTotal, orderIds },
                    refs: [run.id, ...orderIds],
                }];
            for (const order of orders) {
                const updated = await tx.order.updateMany({
                    where: { id: order.id, status: order.status, courierId: null },
                    data: { status: 'courier_assigned', courierId: dto.courierId, courierRunId: run.id },
                });
                if (updated.count !== 1)
                    throw new errors_1.ConflictError('order_assignment_race', `Заказ ${order.id} уже назначен`);
            }
            if (orderIds.length > 0) {
                await this.outbox.enqueueOnTx(tx, {
                    channel: 'push',
                    recipient: dto.courierId,
                    template: 'courier_run_assigned',
                    payload: {
                        title: 'Новый маршрут AliStore',
                        body: `${orderIds.length} доставок · COD ${run.codTotal} сом`,
                        runId: run.id,
                        orderIds,
                        deepLink: `alistore-courier://deliveries/${orderIds[0]}`,
                    },
                });
            }
            return { result: { ...run, orderIds }, events };
        });
    }
    startDelivery(orderId, courierId, idempotencyKey) {
        return this.executeCommand(orderId, courierId, idempotencyKey, 'start', {}, async (tx, order) => {
            if (order.status !== 'courier_assigned') {
                throw new errors_1.ConflictError('delivery_not_assigned', `Заказ ${orderId} имеет статус ${order.status}`);
            }
            assertCourierLifecycleReady(order);
            const updated = await tx.order.updateMany({
                where: { id: orderId, courierId, status: 'courier_assigned' },
                data: { status: 'out_for_delivery' },
            });
            if (updated.count !== 1)
                throw new errors_1.ConflictError('delivery_transition_race', 'Доставка уже изменена');
            const result = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
            return { result, events: [{
                        type: event_types_1.EventType.DeliveryOut,
                        actor: courierId,
                        payload: { orderId, from: 'courier_assigned', to: 'out_for_delivery' },
                        refs: [orderId, order.courierRunId].filter((value) => Boolean(value)),
                    }] };
        });
    }
    completeDelivery(orderId, dto, courierId, idempotencyKey) {
        return this.executeCommand(orderId, courierId, idempotencyKey, 'deliver', {
            codAmount: dto.codAmount,
            reason: dto.reason?.trim() || null,
            evidenceIdempotencyKey: dto.evidenceIdempotencyKey ?? null,
        }, async (tx, order) => {
            if (order.status !== 'out_for_delivery') {
                throw new errors_1.ConflictError('delivery_not_out', `Заказ ${orderId} имеет статус ${order.status}`);
            }
            assertCourierLifecycleReady(order);
            const expectedCod = outstandingAmount(order);
            const reason = dto.reason?.trim() || null;
            if (dto.codAmount > expectedCod) {
                throw new errors_1.ValidationError('delivery_cod_mismatch', `Нельзя получить больше задолженности ${expectedCod} сом`);
            }
            if (dto.codAmount < expectedCod && !reason) {
                throw new errors_1.ValidationError('delivery_partial_cod_reason_required', 'Для частичной оплаты COD требуется причина');
            }
            const updated = await tx.order.updateMany({
                where: { id: orderId, courierId, status: 'out_for_delivery' },
                data: { status: 'delivered' },
            });
            if (updated.count !== 1)
                throw new errors_1.ConflictError('delivery_transition_race', 'Доставка уже изменена');
            if (order.courierRunId && dto.codAmount > 0) {
                await tx.courierRun.update({
                    where: { id: order.courierRunId },
                    data: { collectedTotal: { increment: dto.codAmount } },
                });
            }
            const receivedBefore = settledAmount(order);
            const inventoryEvents = [];
            const lineLifecycle = order.items.some((item) => (item.supplyModeSnapshot === 'to_order' || item.fulfillmentStatus !== 'pending_payment'));
            if (lineLifecycle) {
                const readyItems = await tx.orderItem.findMany({
                    where: { orderId, fulfillmentStatus: 'ready' },
                    select: { id: true },
                    orderBy: { lineNumber: 'asc' },
                });
                for (const item of readyItems) {
                    await (0, order_item_handover_on_tx_1.handOverReadyOrderItemOnTx)(tx, {
                        orderId,
                        orderItemId: item.id,
                        paymentMode: order.paymentMode,
                        actor: courierId,
                        units: this.units,
                        events: inventoryEvents,
                    });
                }
                await recognizeDeliveryFeeOnTx(tx, {
                    orderId,
                    deliveryFee: order.deliveryFee,
                    paymentMode: order.paymentMode,
                    point: order.fulfillmentLocation,
                    actor: courierId,
                    events: inventoryEvents,
                });
            }
            else if (receivedBefore < order.total) {
                if (await (0, order_inventory_sale_1.orderHasTrackedInventoryOnTx)(tx, orderId)) {
                    const codLines = await tx.orderItem.findMany({
                        where: { orderId },
                        select: { id: true, sku: true, supplyModeSnapshot: true },
                    });
                    const codSupplyByOrderItemId = await tx.orderLineSupply.findMany({
                        where: { orderItemId: { in: codLines.map((line) => line.id) } },
                        select: { orderItemId: true, status: true },
                    });
                    (0, order_inventory_sale_1.assertOrderLineSupplyReceived)(orderId, codLines, new Map(codSupplyByOrderItemId.map((row) => [row.orderItemId, row])));
                    await (0, order_inventory_sale_1.assertOrderReservationCoverageOnTx)(tx, orderId, new Date(), { enforceExpiry: false });
                    await (0, order_inventory_sale_1.finalizeOrderInventorySaleOnTx)(tx, {
                        orderId,
                        actor: courierId,
                        units: this.units,
                        events: inventoryEvents,
                    });
                }
            }
            else {
                if (await (0, order_inventory_sale_1.orderHasTrackedInventoryOnTx)(tx, orderId)) {
                    await (0, order_inventory_sale_1.assertOrderInventoryFinalizedOnTx)(tx, orderId);
                }
            }
            const receivableEntry = expectedCod > 0 && !lineLifecycle
                ? await (0, accounting_journal_1.postOrderReceivableOnTx)(tx, {
                    idempotencyKey: `accounting:cod.receivable:${order.id}`,
                    sourceType: 'cod.receivable',
                    sourceRef: order.id,
                    description: `COD к получению по заказу ${order.id}`,
                    order,
                    processedBefore: receivedBefore,
                    amount: expectedCod,
                    occurredAt: new Date(),
                    actor: courierId,
                })
                : null;
            await settleCollectedCodReceivablesOnTx(tx, {
                orderId,
                amount: dto.codAmount,
                actor: courierId,
                commandKey: idempotencyKey,
                runId: order.courierRunId,
                events: inventoryEvents,
            });
            const result = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
            await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                customerId: order.customerId,
                template: 'order_delivered',
                payload: { orderId, codAmount: dto.codAmount, remainingReceivable: expectedCod - dto.codAmount },
                transactional: true,
            });
            return { result, events: [
                    {
                        type: event_types_1.EventType.DeliveryDelivered,
                        actor: courierId,
                        payload: {
                            orderId,
                            from: 'out_for_delivery',
                            to: 'delivered',
                            codAmount: dto.codAmount,
                            expectedCod,
                            remainingReceivable: expectedCod - dto.codAmount,
                            reason,
                            evidenceIdempotencyKey: dto.evidenceIdempotencyKey ?? null,
                        },
                        refs: [orderId, order.courierRunId, dto.evidenceIdempotencyKey].filter((value) => Boolean(value)),
                    },
                    ...inventoryEvents,
                    ...(receivableEntry ? [{
                            type: event_types_1.EventType.AccountingEntryPosted,
                            actor: courierId,
                            payload: {
                                accountingEntryId: receivableEntry.id,
                                sourceType: 'cod.receivable',
                                sourceRef: order.id,
                                orderId,
                                amount: dto.codAmount,
                                taxAmount: receivableEntry.taxAmount,
                            },
                            refs: [receivableEntry.id, orderId],
                        }] : []),
                ] };
        });
    }
    failDelivery(orderId, dto, courierId, idempotencyKey) {
        const payload = {
            reason: dto.reason.trim(),
            evidence: dto.evidence ?? null,
            evidenceIdempotencyKey: dto.evidenceIdempotencyKey ?? null,
        };
        if (!payload.reason)
            throw new errors_1.ValidationError('failure_reason_required', 'Укажите причину неуспешной доставки');
        return this.executeCommand(orderId, courierId, idempotencyKey, 'fail', payload, async (tx, order) => {
            if (order.status !== 'out_for_delivery') {
                throw new errors_1.ConflictError('delivery_not_out', `Заказ ${orderId} имеет статус ${order.status}`);
            }
            await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                customerId: order.customerId,
                template: 'delivery_failed',
                payload: { orderId, reason: payload.reason },
                transactional: true,
            });
            const result = { orderId, recorded: true, status: order.status };
            return { result, events: [{
                        type: event_types_1.EventType.DeliveryFailed,
                        actor: courierId,
                        payload: { orderId, ...payload },
                        refs: [orderId, order.courierRunId, dto.evidenceIdempotencyKey].filter((value) => Boolean(value)),
                    }] };
        });
    }
    async removeOrderFromRun(orderId, dto, actor, expectedCourierId, idempotencyKey) {
        const key = idempotencyKey.trim();
        if (!key || key.length > 128)
            throw new errors_1.ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
        const payload = { reason: dto.reason.trim() };
        if (!payload.reason)
            throw new errors_1.ValidationError('removal_reason_required', 'Укажите причину снятия заказа с рейса');
        const action = 'remove_from_run';
        const replay = await this.prisma.courierCommand.findUnique({ where: { idempotencyKey: key } });
        if (replay)
            return replayCommand(replay, actor, orderId, action, payload);
        try {
            return await this.audit.transaction(async (tx) => {
                const existing = await tx.courierCommand.findUnique({ where: { idempotencyKey: key } });
                if (existing)
                    return { result: replayCommand(existing, actor, orderId, action, payload), events: [] };
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: { payments: { select: { amount: true, status: true } } },
                });
                if (!order)
                    throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
                await tx.courierCommand.create({
                    data: { idempotencyKey: key, courierId: actor, orderId, action, payload: payload },
                });
                if (!order.courierRunId || !order.courierId) {
                    throw new errors_1.ConflictError('order_not_in_run', `Заказ ${orderId} не назначен на курьерский рейс`);
                }
                if (expectedCourierId && order.courierId !== expectedCourierId) {
                    throw new errors_1.ForbiddenError('delivery_forbidden', 'Доставка назначена другому курьеру');
                }
                if (!REMOVABLE_FROM_RUN_STATUSES.includes(order.status)) {
                    throw new errors_1.ConflictError('order_not_removable', `Заказ ${orderId} нельзя снять с рейса из статуса ${order.status}`);
                }
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${order.courierRunId}))`;
                const run = await tx.courierRun.findUnique({ where: { id: order.courierRunId } });
                if (!run)
                    throw new errors_1.ValidationError('run_not_found', `Курьерский рейс ${order.courierRunId} не найден`);
                if (run.handedOver)
                    throw new errors_1.ConflictError('cod_already_handed_over', `COD по рейсу ${run.id} уже сдан`);
                const codReleased = outstandingAmount(order);
                const updated = await tx.order.updateMany({
                    where: { id: orderId, status: order.status, courierRunId: run.id },
                    data: { status: 'paid', courierId: null, courierRunId: null },
                });
                if (updated.count !== 1)
                    throw new errors_1.ConflictError('delivery_transition_race', 'Доставка уже изменена');
                const recalculated = await tx.courierRun.update({
                    where: { id: run.id },
                    data: { codTotal: { decrement: codReleased } },
                });
                const result = {
                    orderId,
                    runId: run.id,
                    status: 'paid',
                    codReleased,
                    codTotal: recalculated.codTotal,
                    collectedTotal: recalculated.collectedTotal,
                };
                await tx.courierCommand.update({
                    where: { idempotencyKey: key },
                    data: { response: JSON.parse(JSON.stringify(result)) },
                });
                return { result, events: [{
                            type: event_types_1.EventType.DeliveryUnassigned,
                            actor,
                            payload: { orderId, runId: run.id, from: order.status, to: 'paid', codReleased, reason: payload.reason },
                            refs: [orderId, run.id],
                        }] };
            });
        }
        catch (error) {
            if (isUniqueConflict(error)) {
                const raced = await this.prisma.courierCommand.findUniqueOrThrow({ where: { idempotencyKey: key } });
                return replayCommand(raced, actor, orderId, action, payload);
            }
            throw error;
        }
    }
    async handover(dto, actor, expectedCourierId, idempotencyKey) {
        const key = idempotencyKey.trim();
        if (!key || key.length > 128)
            throw new errors_1.ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
        const normalized = { amount: dto.amount, reason: dto.reason?.trim() || null };
        const replay = await this.prisma.courierRun.findUnique({ where: { handoverIdempotencyKey: key } });
        if (replay) {
            (0, courier_handover_1.assertCourierRunOwner)(replay, expectedCourierId);
            return (0, courier_handover_1.replayCourierHandover)(replay, dto.runId, normalized);
        }
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${dto.runId}))`;
                const run = await tx.courierRun.findUnique({
                    where: { id: dto.runId },
                    include: { orders: { select: { id: true, status: true } } },
                });
                if (!run)
                    throw new errors_1.ValidationError('run_not_found', `Курьерский рейс ${dto.runId} не найден`);
                (0, courier_handover_1.assertCourierRunOwner)(run, expectedCourierId);
                if (run.handedOver) {
                    if (run.handoverIdempotencyKey === key) {
                        return { result: (0, courier_handover_1.replayCourierHandover)(run, dto.runId, normalized), events: [] };
                    }
                    throw new errors_1.ConflictError('cod_already_handed_over', `COD по рейсу ${dto.runId} уже сдан`);
                }
                if (run.collectedTotal > run.codTotal) {
                    throw new errors_1.ConflictError('run_delivery_incomplete', `Собрано ${run.collectedTotal} из ${run.codTotal} сом`);
                }
                if (run.collectedTotal < run.codTotal && !normalized.reason) {
                    throw new errors_1.ConflictError('run_delivery_incomplete', `Собрано ${run.collectedTotal} из ${run.codTotal} сом`);
                }
                const expected = run.collectedTotal;
                const diff = dto.amount - expected;
                if (diff !== 0 && !normalized.reason) {
                    throw new errors_1.ValidationError('handover_reason_required', `Расхождение COD ${diff} сом требует причину`);
                }
                if (run.orders.length > 0) {
                    const deliveredOrderIds = run.orders
                        .filter((order) => order.status === 'delivered')
                        .map((order) => order.id);
                    const recognized = await tx.accountingJournalEntry.findMany({
                        where: { sourceType: 'cod.receivable', sourceRef: { in: run.orders.map((order) => order.id) } },
                        select: { sourceRef: true, documentAmount: true },
                    });
                    const deliveredItems = await tx.orderItem.findMany({
                        where: { orderId: { in: deliveredOrderIds } },
                        select: { id: true, orderId: true },
                    });
                    const orderIdByItemId = new Map(deliveredItems.map((item) => [item.id, item.orderId]));
                    const lineRecognized = deliveredItems.length > 0
                        ? await tx.accountingJournalEntry.findMany({
                            where: {
                                sourceType: { in: ['order_item.handover', 'order_line.handover'] },
                                sourceRef: { in: deliveredItems.map((item) => item.id) },
                            },
                            include: { lines: { where: { accountCode: '1100' } } },
                        })
                        : [];
                    const deliveryRecognized = deliveredOrderIds.length > 0
                        ? await tx.accountingJournalEntry.findMany({
                            where: {
                                sourceType: 'order.delivery.handover',
                                sourceRef: { in: deliveredOrderIds },
                            },
                            include: { lines: { where: { accountCode: '1100' } } },
                        })
                        : [];
                    const covered = new Set(recognized.map((entry) => entry.sourceRef));
                    for (const entry of lineRecognized) {
                        const orderId = orderIdByItemId.get(entry.sourceRef);
                        if (orderId)
                            covered.add(orderId);
                    }
                    const recognizedTotal = recognized.reduce((sum, entry) => sum + (entry.documentAmount ?? 0), 0)
                        + lineRecognized.reduce((sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + line.debit, 0), 0)
                        + deliveryRecognized.reduce((sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + line.debit, 0), 0);
                    if (deliveredOrderIds.length === 0) {
                        throw new errors_1.ConflictError(expected > 0 ? 'cod_receivable_not_recognized' : 'run_delivery_incomplete', 'Ни одна доставка рейса ещё не признана выполненной');
                    }
                    if (deliveredOrderIds.some((orderId) => !covered.has(orderId))) {
                        throw new errors_1.ConflictError('cod_receivable_not_recognized', 'COD нельзя сдать до признания дебиторской задолженности всех доставок');
                    }
                    if (expected > recognizedTotal) {
                        throw new errors_1.ConflictError('cod_receivable_not_recognized', 'COD нельзя сдать до признания дебиторской задолженности всех доставок');
                    }
                }
                const settled = await tx.courierRun.update({
                    where: { id: dto.runId },
                    data: {
                        handedOver: true,
                        handoverIdempotencyKey: key,
                        handoverAmount: dto.amount,
                        handoverReason: normalized.reason,
                        handedOverAt: new Date(),
                    },
                });
                const accountingEntry = expected > 0
                    ? await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                        idempotencyKey: `accounting:cod.handover:${dto.runId}:${key}`,
                        sourceType: 'cod.handover',
                        sourceRef: `${dto.runId}:${key}`,
                        description: `Сдача COD по рейсу ${dto.runId}`,
                        occurredAt: settled.handedOverAt ?? new Date(),
                        createdBy: actor,
                        lines: dto.amount === expected
                            ? [
                                { accountCode: '1000', debit: dto.amount, memo: 'Фактически сданные наличные COD' },
                                { accountCode: run.orders.length > 0 ? '1100' : '4000', credit: expected, memo: run.orders.length > 0 ? 'Погашение дебиторской задолженности по COD' : 'Выручка legacy COD без заказа' },
                            ]
                            : dto.amount < expected
                                ? [
                                    { accountCode: '1000', debit: dto.amount, memo: 'Фактически сданные наличные COD' },
                                    { accountCode: '6990', debit: expected - dto.amount, memo: 'Недостача COD' },
                                    { accountCode: run.orders.length > 0 ? '1100' : '4000', credit: expected, memo: run.orders.length > 0 ? 'Погашение COD с расхождением' : 'Выручка legacy COD без заказа' },
                                ]
                                : [
                                    { accountCode: '1000', debit: dto.amount, memo: 'Фактически сданные наличные COD' },
                                    { accountCode: run.orders.length > 0 ? '1100' : '4000', credit: expected, memo: run.orders.length > 0 ? 'Погашение дебиторской задолженности по COD' : 'Выручка legacy COD без заказа' },
                                    { accountCode: '6990', credit: dto.amount - expected, memo: 'Излишек COD' },
                                ],
                    })
                    : null;
                if (dto.amount > 0) {
                    await (0, cash_drawer_1.recordCashDrawerMovementOnTx)(tx, {
                        idempotencyKey: `drawer:cod.handover:${dto.runId}:${key}`,
                        staffId: actor,
                        amount: dto.amount,
                        kind: 'cod_handover',
                        sourceType: 'cod.handover',
                        sourceRef: `${dto.runId}:${key}`,
                        reason: normalized.reason,
                        createdBy: actor,
                        accountingEntryId: accountingEntry?.id ?? null,
                    });
                }
                const events = [{
                        type: event_types_1.EventType.CashHandover,
                        actor,
                        payload: { runId: dto.runId, codTotal: run.codTotal, collectedTotal: run.collectedTotal, amount: dto.amount, diff, reason: normalized.reason },
                        refs: [dto.runId],
                    }];
                if (accountingEntry)
                    events.push({
                        type: event_types_1.EventType.AccountingEntryPosted,
                        actor,
                        payload: { accountingEntryId: accountingEntry.id, sourceType: 'cod.handover', sourceRef: `${dto.runId}:${key}`, amount: dto.amount, expected, diff },
                        refs: [accountingEntry.id, dto.runId],
                    });
                if (diff !== 0)
                    events.push({
                        type: event_types_1.EventType.CashShortage,
                        actor,
                        payload: { runId: dto.runId, diff, reason: normalized.reason },
                        refs: [dto.runId],
                    });
                return { result: { ...settled, diff }, events };
            });
        }
        catch (error) {
            if (isUniqueConflict(error)) {
                const raced = await this.prisma.courierRun.findUniqueOrThrow({ where: { handoverIdempotencyKey: key } });
                (0, courier_handover_1.assertCourierRunOwner)(raced, expectedCourierId);
                return (0, courier_handover_1.replayCourierHandover)(raced, dto.runId, normalized);
            }
            throw error;
        }
    }
    async executeCommand(orderId, courierId, idempotencyKey, action, payload, work) {
        const key = idempotencyKey.trim();
        if (!key || key.length > 128)
            throw new errors_1.ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
        const replay = await this.prisma.courierCommand.findUnique({ where: { idempotencyKey: key } });
        if (replay)
            return replayCommand(replay, courierId, orderId, action, payload);
        try {
            return await this.audit.transaction(async (tx) => {
                const existing = await tx.courierCommand.findUnique({ where: { idempotencyKey: key } });
                if (existing)
                    return { result: replayCommand(existing, courierId, orderId, action, payload), events: [] };
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: {
                        payments: { select: { amount: true, status: true } },
                        items: {
                            select: {
                                taxCode: true,
                                taxRateBps: true,
                                taxAmount: true,
                                supplyModeSnapshot: true,
                                fulfillmentStatus: true,
                            },
                        },
                        receivables: {
                            select: { kind: true, status: true, amount: true, settledAmount: true },
                        },
                    },
                });
                if (!order)
                    throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
                if (order.courierId !== courierId)
                    throw new errors_1.ForbiddenError('delivery_forbidden', 'Доставка назначена другому курьеру');
                await tx.courierCommand.create({
                    data: { idempotencyKey: key, courierId, orderId, action, payload: payload },
                });
                const outcome = await work(tx, order);
                await tx.courierCommand.update({
                    where: { idempotencyKey: key },
                    data: { response: JSON.parse(JSON.stringify(outcome.result)) },
                });
                return outcome;
            });
        }
        catch (error) {
            if (isUniqueConflict(error)) {
                const raced = await this.prisma.courierCommand.findUniqueOrThrow({ where: { idempotencyKey: key } });
                return replayCommand(raced, courierId, orderId, action, payload);
            }
            throw error;
        }
    }
};
exports.CourierService = CourierService;
exports.CourierService = CourierService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService,
        units_service_1.UnitsService])
], CourierService);
function assertCourierLifecycleReady(order) {
    const lifecycleAware = order.items.some((item) => (item.supplyModeSnapshot === 'to_order' || item.fulfillmentStatus !== 'pending_payment'));
    if (lifecycleAware) {
        const active = order.items.filter((item) => (!['cancelled', 'customer_cancelled', 'handed_over'].includes(item.fulfillmentStatus)));
        const incomplete = active.filter((item) => item.fulfillmentStatus !== 'ready');
        if (incomplete.length > 0) {
            throw new errors_1.ConflictError('courier_order_not_fully_ready', `Заказ ${order.id} нельзя передать курьеру: не готовы ${incomplete.length} строк`);
        }
    }
    const unsettled = order.receivables.filter((receivable) => (receivable.status !== 'settled'
        && receivable.status !== 'cancelled'
        && receivable.settledAmount < receivable.amount));
    if (unsettled.some((receivable) => receivable.kind === 'supply_deposit')) {
        throw new errors_1.ConflictError('courier_supply_deposit_unsettled', `Заказ ${order.id} нельзя передать курьеру до подтверждения задатка`);
    }
    const allowedCodKinds = new Set(['stock_sale', 'supply_balance', 'delivery']);
    if (order.paymentMode === 'cod') {
        const unsupported = unsettled.find((receivable) => !allowedCodKinds.has(receivable.kind));
        if (unsupported) {
            throw new errors_1.ConflictError('courier_receivable_not_collectable', `Начисление ${unsupported.kind} нельзя собирать курьеру`);
        }
    }
    else if (unsettled.length > 0) {
        throw new errors_1.ConflictError('order_payment_unsettled', `Предоплаченный заказ ${order.id} нельзя передать до закрытия начислений`);
    }
}
async function settleCollectedCodReceivablesOnTx(tx, input) {
    if (input.amount === 0)
        return;
    const receivables = await tx.orderReceivable.findMany({
        where: {
            orderId: input.orderId,
            kind: { in: ['stock_sale', 'supply_balance', 'delivery'] },
            status: { not: 'cancelled' },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const kindOrdinal = new Map([
        ['stock_sale', 0],
        ['supply_balance', 1],
        ['delivery', 2],
    ]);
    receivables.sort((left, right) => ((kindOrdinal.get(left.kind) ?? Number.MAX_SAFE_INTEGER)
        - (kindOrdinal.get(right.kind) ?? Number.MAX_SAFE_INTEGER)
        || left.createdAt.getTime() - right.createdAt.getTime()
        || left.id.localeCompare(right.id)));
    if (receivables.length === 0)
        return;
    const collectible = receivables.reduce((sum, receivable) => sum + Math.max(0, receivable.amount - receivable.settledAmount), 0);
    if (input.amount > collectible) {
        throw new errors_1.ConflictError('cod_receivable_allocation_invalid', `Собранный COD ${input.amount} превышает открытые начисления ${collectible}`);
    }
    let remaining = input.amount;
    let allocatedTotal = 0;
    let ordinal = 0;
    for (const receivable of receivables) {
        if (remaining === 0)
            break;
        const openAmount = Math.max(0, receivable.amount - receivable.settledAmount);
        if (openAmount === 0)
            continue;
        const allocated = Math.min(remaining, openAmount);
        const settledAmount = receivable.settledAmount + allocated;
        const status = settledAmount === receivable.amount ? 'settled' : 'partially_settled';
        const updated = await tx.orderReceivable.updateMany({
            where: {
                id: receivable.id,
                status: receivable.status,
                settledAmount: receivable.settledAmount,
            },
            data: { settledAmount, status },
        });
        if (updated.count !== 1) {
            throw new errors_1.ConflictError('cod_receivable_allocation_race', `Начисление ${receivable.id} изменилось параллельно`);
        }
        const sourceOwner = input.runId ?? input.orderId;
        const sourceRef = `${sourceOwner}:${input.commandKey}:${ordinal}`;
        input.events.push({
            type: event_types_1.EventType.OrderReceivableAllocated,
            actor: input.actor,
            payload: {
                sourceType: 'courier_cod',
                sourceRef,
                courierCommandKey: input.commandKey,
                runId: input.runId,
                orderId: input.orderId,
                receivableId: receivable.id,
                kind: receivable.kind,
                allocatedAmount: allocated,
                beforeSettledAmount: receivable.settledAmount,
                afterSettledAmount: settledAmount,
                beforeStatus: receivable.status,
                afterStatus: status,
                ordinal,
            },
            refs: [...new Set([
                    input.orderId,
                    receivable.id,
                    sourceOwner,
                    input.commandKey,
                    sourceRef,
                ])],
        });
        if (status === 'settled') {
            input.events.push({
                type: event_types_1.EventType.OrderReceivableSettled,
                actor: input.actor,
                payload: {
                    orderId: input.orderId,
                    receivableId: receivable.id,
                    kind: receivable.kind,
                    source: 'courier_cod',
                },
                refs: [input.orderId, receivable.id],
            });
        }
        remaining -= allocated;
        allocatedTotal += allocated;
        ordinal += 1;
    }
    if (remaining !== 0 || allocatedTotal !== input.amount) {
        throw new errors_1.ConflictError('cod_receivable_allocation_invalid', `Аллокации COD ${allocatedTotal} не совпадают с собранной суммой ${input.amount}`);
    }
}
async function recognizeDeliveryFeeOnTx(tx, input) {
    const receivables = await tx.orderReceivable.findMany({
        where: { orderId: input.orderId, kind: 'delivery' },
        include: { allocations: true },
    });
    if (input.deliveryFee === 0) {
        if (receivables.length > 0) {
            throw new errors_1.ConflictError('delivery_receivable_unexpected', 'У заказа без доставки найдено начисление доставки');
        }
        return;
    }
    if (receivables.length !== 1 || receivables[0].amount !== input.deliveryFee) {
        throw new errors_1.ConflictError('delivery_receivable_invalid', 'Начисление доставки не совпадает со стоимостью доставки заказа');
    }
    const receivable = receivables[0];
    const liability = receivable.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (liability !== receivable.settledAmount || liability > receivable.amount) {
        throw new errors_1.ConflictError('delivery_payment_allocation_invalid', 'Платёжные аллокации доставки повреждены');
    }
    if (input.paymentMode !== 'cod' && receivable.status !== 'settled') {
        throw new errors_1.ConflictError('delivery_receivable_unpaid', 'Перед доставкой необходимо закрыть стоимость доставки');
    }
    const codReceivable = receivable.amount - liability;
    const entry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
        idempotencyKey: `accounting:order.delivery.handover:${input.orderId}`,
        sourceType: 'order.delivery.handover',
        sourceRef: input.orderId,
        description: `Признание выручки доставки заказа ${input.orderId}`,
        point: input.point,
        documentAmount: receivable.amount,
        baseAmount: receivable.amount,
        taxCode: 'none',
        taxRateBps: 0,
        taxAmount: 0,
        occurredAt: new Date(),
        createdBy: input.actor,
        lines: [
            ...(liability > 0 ? [{ accountCode: '2400', debit: liability, memo: 'Погашение предоплаты доставки' }] : []),
            ...(codReceivable > 0 ? [{ accountCode: '1100', debit: codReceivable, memo: 'Дебиторская задолженность COD за доставку' }] : []),
            { accountCode: '4000', credit: receivable.amount, memo: 'Выручка за выполненную доставку' },
        ],
    });
    input.events.push({
        type: event_types_1.EventType.AccountingEntryPosted,
        actor: input.actor,
        payload: {
            accountingEntryId: entry.id,
            sourceType: 'order.delivery.handover',
            sourceRef: input.orderId,
            liability,
            codReceivable,
        },
        refs: [entry.id, input.orderId, receivable.id],
    });
}
function outstandingAmount(order) {
    return Math.max(0, order.total - settledAmount(order));
}
function settledAmount(order) {
    return order.payments
        .filter((payment) => payment.amount > 0 && SETTLED_PAYMENT_STATUSES.has(payment.status))
        .reduce((sum, payment) => sum + payment.amount, 0);
}
function requireIdempotencyKey(value) {
    const key = value.trim();
    if (!key || key.length > 128)
        throw new errors_1.ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
    return key;
}
function replayRunAssignment(existing, dto) {
    const expectedOrderIds = [...new Set(dto.orderIds ?? [])].sort();
    const actualOrderIds = existing.orders.map((order) => order.id).sort();
    if (existing.courierId !== dto.courierId
        || existing.codTotal !== dto.codTotal
        || expectedOrderIds.length !== actualOrderIds.length
        || expectedOrderIds.some((id, index) => id !== actualOrderIds[index])) {
        throw new errors_1.ConflictError('courier_run_idempotency_mismatch', 'Idempotency-Key уже использован для другого рейса');
    }
    const { orders: _, ...run } = existing;
    return { ...run, orderIds: actualOrderIds };
}
function replayCommand(command, courierId, orderId, action, payload) {
    const storedPayload = normalizeReplayPayload(command.action, command.payload);
    const requestedPayload = normalizeReplayPayload(action, payload);
    const same = command.courierId === courierId
        && command.orderId === orderId
        && command.action === action
        && canonicalJson(storedPayload) === canonicalJson(requestedPayload);
    if (!same)
        throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой courier-командой');
    if (command.response === null || command.response === undefined) {
        throw new errors_1.ConflictError('command_in_progress', 'Courier-команда ещё выполняется');
    }
    return command.response;
}
function normalizeReplayPayload(action, payload) {
    if (action !== 'deliver' || !payload || typeof payload !== 'object' || Array.isArray(payload))
        return payload;
    const record = payload;
    return { ...record, reason: typeof record.reason === 'string' ? record.reason : null };
}
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function isUniqueConflict(error) {
    return (0, prisma_errors_1.isUniqueConstraintViolation)(error);
}
//# sourceMappingURL=courier.service.js.map