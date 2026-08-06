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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceExecutionService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const prisma_service_1 = require("../prisma/prisma.service");
const inventory_valuation_1 = require("../inventory/inventory-valuation");
const warranty_state_1 = require("../warranty/warranty-state");
const service_command_1 = require("./service-command");
const REPAIR_WARRANTY_MS = 30 * 24 * 60 * 60 * 1000;
const MANAGER_ROLES = new Set(['admin', 'owner']);
const workOrderInclude = {
    warrantyCase: true,
    payments: { orderBy: { createdAt: 'asc' } },
    parts: {
        include: { product: { select: { id: true, sku: true, name: true, cost: true } } },
        orderBy: { reservedAt: 'asc' },
    },
};
let ServiceExecutionService = class ServiceExecutionService {
    constructor(prisma, audit, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
    }
    async reservePart(id, dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = { workOrderId: id, productId: dto.productId, qty: dto.qty };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'reserve_part', request);
        try {
            return await this.audit.transaction(async (tx) => {
                await lockWorkOrder(tx, id);
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'reserve_part', request), events: [] };
                const workOrder = await findWorkOrder(tx, id);
                await assertPartsActor(tx, actor, workOrder.technicianId, workOrder.point);
                assertExecutionOpen(workOrder.warrantyCase.status);
                assertPaidRepairFunded(workOrder);
                const product = await tx.product.findUnique({
                    where: { id: dto.productId },
                    include: { _count: { select: { bundleComponents: true } } },
                });
                if (!product || product.archived)
                    throw new errors_1.ValidationError('service_part_not_found', 'Запчасть не найдена');
                if (product.trackingMode !== 'quantity' || product._count.bundleComponents > 0) {
                    throw new errors_1.ValidationError('service_part_quantity_required', 'Запчасть должна иметь обычный количественный учёт');
                }
                const balance = await tx.inventoryBalance.findUnique({
                    where: { productId_location: { productId: product.id, location: workOrder.point } },
                });
                if (!balance)
                    throw new errors_1.ConflictError('service_part_out_of_stock', 'Запчасти нет на складе этой точки');
                await tx.$queryRaw `SELECT id FROM "InventoryBalance" WHERE id = ${balance.id} FOR UPDATE`;
                const lockedBalance = await tx.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
                const consignment = await tx.quantityConsignmentLot.aggregate({
                    where: { balanceId: balance.id },
                    _sum: { availableQty: true },
                });
                const storeOwnedAvailable = lockedBalance.onHand - lockedBalance.reserved - (consignment._sum.availableQty ?? 0);
                if (storeOwnedAvailable < dto.qty) {
                    throw new errors_1.ConflictError('service_part_insufficient_stock', 'Недостаточно свободных запчастей');
                }
                await tx.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { increment: dto.qty } } });
                const part = await tx.servicePart.create({
                    data: {
                        workOrderId: id,
                        productId: product.id,
                        balanceId: balance.id,
                        location: workOrder.point,
                        qty: dto.qty,
                        reservedBy: actor,
                    },
                });
                const result = await tx.serviceWorkOrder.findUniqueOrThrow({ where: { id }, include: workOrderInclude });
                await recordCommand(tx, key, id, 'reserve_part', request, result);
                return {
                    result,
                    events: [{
                            type: event_types_1.EventType.ServicePartReserved,
                            actor,
                            payload: { workOrderId: id, partId: part.id, productId: product.id, qty: dto.qty, location: workOrder.point },
                            refs: [id, workOrder.warrantyCaseId, part.id, product.id, balance.id],
                        }],
                };
            });
        }
        catch (error) {
            return this.replayAfterRace(error, key, 'reserve_part', request);
        }
    }
    async releasePart(id, partId, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = { workOrderId: id, partId };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'release_part', request);
        try {
            return await this.audit.transaction(async (tx) => {
                await lockWorkOrder(tx, id);
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'release_part', request), events: [] };
                const workOrder = await findWorkOrder(tx, id);
                await assertPartsActor(tx, actor, workOrder.technicianId, workOrder.point);
                assertExecutionOpen(workOrder.warrantyCase.status);
                const part = await tx.servicePart.findFirst({ where: { id: partId, workOrderId: id } });
                if (!part)
                    throw new errors_1.ValidationError('service_part_not_found', 'Резерв запчасти не найден');
                if (part.status !== 'reserved')
                    throw new errors_1.ConflictError('service_part_not_reserved', 'Запчасть уже списана или освобождена');
                await tx.$queryRaw `SELECT id FROM "InventoryBalance" WHERE id = ${part.balanceId} FOR UPDATE`;
                const released = await tx.inventoryBalance.updateMany({
                    where: { id: part.balanceId, reserved: { gte: part.qty } },
                    data: { reserved: { decrement: part.qty } },
                });
                if (released.count !== 1)
                    throw new errors_1.ConflictError('service_part_reservation_corrupt', 'Резерв склада повреждён');
                await tx.servicePart.update({
                    where: { id: part.id },
                    data: { status: 'released', releasedBy: actor, releasedAt: new Date() },
                });
                const result = await tx.serviceWorkOrder.findUniqueOrThrow({ where: { id }, include: workOrderInclude });
                await recordCommand(tx, key, id, 'release_part', request, result);
                return {
                    result,
                    events: [{
                            type: event_types_1.EventType.ServicePartReleased,
                            actor,
                            payload: { workOrderId: id, partId: part.id, productId: part.productId, qty: part.qty, location: part.location },
                            refs: [id, workOrder.warrantyCaseId, part.id, part.productId, part.balanceId],
                        }],
                };
            });
        }
        catch (error) {
            return this.replayAfterRace(error, key, 'release_part', request);
        }
    }
    async consumePart(id, partId, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = { workOrderId: id, partId };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'consume_part', request);
        try {
            return await this.audit.transaction(async (tx) => {
                await lockWorkOrder(tx, id);
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'consume_part', request), events: [] };
                const workOrder = await findWorkOrder(tx, id);
                await assertTechnicianActor(tx, actor, workOrder.technicianId, workOrder.point);
                if (workOrder.warrantyCase.status !== 'repairing') {
                    throw new errors_1.ConflictError('service_repair_not_in_progress', 'Запчасть списывается только во время ремонта');
                }
                const part = await tx.servicePart.findFirst({ where: { id: partId, workOrderId: id } });
                if (!part)
                    throw new errors_1.ValidationError('service_part_not_found', 'Резерв запчасти не найден');
                if (part.status !== 'reserved')
                    throw new errors_1.ConflictError('service_part_not_reserved', 'Запчасть уже списана или освобождена');
                await tx.$queryRaw `SELECT id FROM "InventoryBalance" WHERE id = ${part.balanceId} FOR UPDATE`;
                const consumed = await tx.inventoryBalance.updateMany({
                    where: { id: part.balanceId, onHand: { gte: part.qty }, reserved: { gte: part.qty } },
                    data: { onHand: { decrement: part.qty }, reserved: { decrement: part.qty } },
                });
                if (consumed.count !== 1)
                    throw new errors_1.ConflictError('service_part_reservation_corrupt', 'Резерв запчасти не соответствует складу');
                const movement = await tx.inventoryMovement.create({
                    data: {
                        idempotencyKey: `service-part:${part.id}`,
                        productId: part.productId,
                        qty: -part.qty,
                        type: 'service_consumed',
                        from: part.location,
                        reason: `Service work order ${id}`,
                    },
                });
                const valuation = await (0, inventory_valuation_1.adjustQuantityValuationOnTx)(tx, {
                    movementId: movement.id,
                    productId: part.productId,
                    balanceId: part.balanceId,
                    location: part.location,
                    quantityDelta: -part.qty,
                    actor,
                    sourceType: 'service.consumed',
                    debitAccount: '5000',
                });
                await tx.inventoryMovement.update({
                    where: { id: movement.id },
                    data: {
                        unitCost: valuation.unitCost,
                        totalValue: valuation.totalValue,
                        valuationQty: valuation.complete ? part.qty : null,
                    },
                });
                await tx.servicePart.update({
                    where: { id: part.id },
                    data: { status: 'consumed', consumedBy: actor, consumedAt: new Date(), movementId: movement.id },
                });
                const result = await tx.serviceWorkOrder.findUniqueOrThrow({ where: { id }, include: workOrderInclude });
                await recordCommand(tx, key, id, 'consume_part', request, result);
                return {
                    result,
                    events: [
                        {
                            type: event_types_1.EventType.ServicePartConsumed,
                            actor,
                            payload: { workOrderId: id, partId: part.id, productId: part.productId, qty: part.qty, movementId: movement.id, location: part.location, totalValue: valuation.totalValue },
                            refs: [id, workOrder.warrantyCaseId, part.id, part.productId, movement.id],
                        },
                        ...(valuation.entry ? [{
                                type: event_types_1.EventType.AccountingEntryPosted,
                                actor,
                                payload: { accountingEntryId: valuation.entry.id, sourceType: 'service.consumed', sourceRef: movement.id, amount: valuation.totalValue },
                                refs: [valuation.entry.id, movement.id, part.productId, id],
                            }] : []),
                    ],
                };
            });
        }
        catch (error) {
            return this.replayAfterRace(error, key, 'consume_part', request);
        }
    }
    start(id, actor, rawKey) {
        return this.transition(id, actor, rawKey, 'start_repair', 'approved', 'repairing');
    }
    async complete(id, dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = { workOrderId: id, summary: dto.summary.trim() };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'complete_repair', request);
        try {
            return await this.audit.transaction(async (tx) => {
                await lockWorkOrder(tx, id);
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'complete_repair', request), events: [] };
                const workOrder = await findWorkOrder(tx, id);
                await assertTechnicianActor(tx, actor, workOrder.technicianId, workOrder.point);
                if (workOrder.warrantyCase.status !== 'repairing') {
                    throw new errors_1.ConflictError('service_repair_not_in_progress', 'Ремонт ещё не начат или уже завершён');
                }
                assertPaidRepairFunded(workOrder);
                const unresolved = await tx.servicePart.count({ where: { workOrderId: id, status: 'reserved' } });
                if (unresolved > 0)
                    throw new errors_1.ConflictError('service_parts_unresolved', 'Сначала спишите или освободите все зарезервированные запчасти');
                (0, warranty_state_1.assertWarrantyTransition)('repairing', 'repaired');
                await tx.warrantyCase.update({ where: { id: workOrder.warrantyCaseId }, data: { status: 'repaired' } });
                await tx.serviceWorkOrder.update({
                    where: { id },
                    data: { repairCompletedAt: new Date(), completionSummary: dto.summary.trim() },
                });
                const result = await tx.serviceWorkOrder.findUniqueOrThrow({ where: { id }, include: workOrderInclude });
                await recordCommand(tx, key, id, 'complete_repair', request, result);
                if (this.outbox) {
                    await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                        customerId: workOrder.warrantyCase.customerId,
                        template: 'service_repair_completed',
                        payload: { workOrderId: id, warrantyId: workOrder.warrantyCaseId, imei: workOrder.warrantyCase.imei },
                        transactional: true,
                    });
                }
                return {
                    result,
                    events: [{
                            type: event_types_1.EventType.ServiceRepairCompleted,
                            actor,
                            payload: { workOrderId: id, outcome: 'repaired' },
                            refs: [id, workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
                        }],
                };
            });
        }
        catch (error) {
            return this.replayAfterRace(error, key, 'complete_repair', request);
        }
    }
    async replace(id, dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const replacementImei = dto.replacementImei.trim().toUpperCase();
        const request = { workOrderId: id, replacementImei, summary: dto.summary.trim() };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'replace_device', request);
        try {
            return await this.audit.transaction(async (tx) => {
                await lockWorkOrder(tx, id);
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'replace_device', request), events: [] };
                const workOrder = await findWorkOrder(tx, id);
                await assertTechnicianActor(tx, actor, workOrder.technicianId, workOrder.point);
                if (workOrder.warrantyCase.serviceType !== 'warranty') {
                    throw new errors_1.ConflictError('service_replacement_warranty_only', 'Замена устройства доступна только по гарантии');
                }
                if (!['approved', 'repairing'].includes(workOrder.warrantyCase.status)) {
                    throw new errors_1.ConflictError('service_replacement_closed', 'Замена недоступна в текущем статусе');
                }
                const unresolved = await tx.servicePart.count({ where: { workOrderId: id, status: 'reserved' } });
                if (unresolved > 0)
                    throw new errors_1.ConflictError('service_parts_unresolved', 'Сначала освободите все зарезервированные запчасти');
                const original = await tx.deviceUnit.findUnique({ where: { imei: workOrder.warrantyCase.imei } });
                if (!original?.orderId)
                    throw new errors_1.ConflictError('service_original_sale_missing', 'Не найдена исходная продажа устройства');
                const rows = await tx.$queryRaw `SELECT id FROM "DeviceUnit" WHERE imei = ${replacementImei} FOR UPDATE`;
                if (rows.length === 0)
                    throw new errors_1.ValidationError('service_replacement_not_found', 'Устройство для замены не найдено');
                const replacement = await tx.deviceUnit.findUniqueOrThrow({ where: { imei: replacementImei } });
                if (replacement.status !== 'in_stock' || replacement.location !== workOrder.point || replacement.productId !== original.productId) {
                    throw new errors_1.ConflictError('service_replacement_ineligible', 'Замена должна быть свободным устройством той же модели на этой точке');
                }
                await tx.deviceUnit.update({ where: { id: original.id }, data: { status: 'in_repair' } });
                await tx.deviceUnit.update({ where: { id: replacement.id }, data: { status: 'sold', orderId: original.orderId } });
                (0, warranty_state_1.assertWarrantyTransition)(workOrder.warrantyCase.status, 'replaced');
                const now = new Date();
                await tx.warrantyCase.update({ where: { id: workOrder.warrantyCaseId }, data: { status: 'replaced' } });
                await tx.serviceWorkOrder.update({
                    where: { id },
                    data: {
                        replacementImei,
                        repairStartedAt: workOrder.repairStartedAt ?? now,
                        repairCompletedAt: now,
                        completionSummary: dto.summary.trim(),
                    },
                });
                const result = await tx.serviceWorkOrder.findUniqueOrThrow({ where: { id }, include: workOrderInclude });
                await recordCommand(tx, key, id, 'replace_device', request, result);
                return {
                    result,
                    events: [{
                            type: event_types_1.EventType.ServiceDeviceReplaced,
                            actor,
                            payload: { workOrderId: id, originalImei: original.imei, replacementImei, orderId: original.orderId },
                            refs: [id, workOrder.warrantyCaseId, original.imei, replacementImei, original.orderId],
                        }],
                };
            });
        }
        catch (error) {
            return this.replayAfterRace(error, key, 'replace_device', request);
        }
    }
    close(id, actor, rawKey) {
        return this.transition(id, actor, rawKey, 'close_repair', ['repaired', 'replaced'], 'closed');
    }
    async transition(id, actor, rawKey, action, from, to) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = { workOrderId: id, to };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, action, request);
        try {
            return await this.audit.transaction(async (tx) => {
                await lockWorkOrder(tx, id);
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, action, request), events: [] };
                const workOrder = await findWorkOrder(tx, id);
                await assertTechnicianActor(tx, actor, workOrder.technicianId, workOrder.point);
                const allowed = Array.isArray(from) ? from : [from];
                if (!allowed.includes(workOrder.warrantyCase.status)) {
                    throw new errors_1.ConflictError('service_transition_closed', 'Действие недоступно в текущем статусе ремонта');
                }
                if (action === 'start_repair')
                    assertPaidRepairFunded(workOrder);
                if (action === 'close_repair') {
                    const unresolved = await tx.servicePart.count({ where: { workOrderId: id, status: 'reserved' } });
                    if (unresolved > 0)
                        throw new errors_1.ConflictError('service_parts_unresolved', 'Сначала спишите или освободите все запчасти');
                    const activeLoan = await tx.loanerLoan.count({ where: { workOrderId: id, status: { in: ['prepared', 'issued', 'overdue'] } } });
                    if (activeLoan > 0)
                        throw new errors_1.ConflictError('service_loaner_unreturned', 'Сначала верните или отмените подменное устройство');
                }
                (0, warranty_state_1.assertWarrantyTransition)(workOrder.warrantyCase.status, to);
                const now = new Date();
                await tx.warrantyCase.update({ where: { id: workOrder.warrantyCaseId }, data: { status: to } });
                await tx.serviceWorkOrder.update({
                    where: { id },
                    data: action === 'start_repair'
                        ? { repairStartedAt: now }
                        : {
                            repairStartedAt: workOrder.repairStartedAt ?? workOrder.estimateApprovedAt ?? workOrder.createdAt,
                            repairCompletedAt: workOrder.repairCompletedAt ?? now,
                            repairClosedAt: now,
                            repairWarrantyUntil: new Date(now.getTime() + REPAIR_WARRANTY_MS),
                        },
                });
                const result = await tx.serviceWorkOrder.findUniqueOrThrow({ where: { id }, include: workOrderInclude });
                await recordCommand(tx, key, id, action, request, result);
                return {
                    result,
                    events: [{
                            type: action === 'start_repair' ? event_types_1.EventType.ServiceRepairStarted : event_types_1.EventType.ServiceWorkOrderClosed,
                            actor,
                            payload: { workOrderId: id, from: workOrder.warrantyCase.status, to, repairWarrantyUntil: result.repairWarrantyUntil },
                            refs: [id, workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
                        }],
                };
            });
        }
        catch (error) {
            return this.replayAfterRace(error, key, action, request);
        }
    }
    async replayAfterRace(error, key, action, request) {
        if ((0, service_command_1.isServiceCommandUniqueViolation)(error)) {
            const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
            if (command)
                return (0, service_command_1.replayServiceCommand)(command, action, request);
        }
        throw error;
    }
};
exports.ServiceExecutionService = ServiceExecutionService;
exports.ServiceExecutionService = ServiceExecutionService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService])
], ServiceExecutionService);
async function lockWorkOrder(tx, id) {
    await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'service-execution:' + id}))::text AS locked`;
    const rows = await tx.$queryRaw `SELECT id FROM "ServiceWorkOrder" WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0)
        throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
}
async function findWorkOrder(tx, id) {
    const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: workOrderInclude });
    if (!workOrder)
        throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
    return workOrder;
}
function assertExecutionOpen(status) {
    if (!['approved', 'repairing'].includes(status)) {
        throw new errors_1.ConflictError('service_parts_closed', 'Запчасти доступны только для согласованного активного ремонта');
    }
}
function assertPaidRepairFunded(workOrder) {
    if (workOrder.warrantyCase.serviceType !== 'paid')
        return;
    const paid = workOrder.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (!workOrder.estimateAmount || paid !== workOrder.estimateAmount) {
        throw new errors_1.ConflictError('service_repair_not_paid', 'Платный ремонт должен быть полностью оплачен');
    }
}
async function assertPartsActor(tx, actor, technicianId, point) {
    const staff = await activeStaff(tx, actor);
    if (MANAGER_ROLES.has(staff.role))
        return;
    const allowed = staff.role === 'service' || (staff.role === 'technician' && actor === technicianId);
    if (!allowed || staff.point !== point) {
        throw new errors_1.ConflictError('service_parts_actor_forbidden', 'Нет доступа к запчастям этой точки');
    }
}
async function assertTechnicianActor(tx, actor, technicianId, point) {
    const staff = await activeStaff(tx, actor);
    if (!technicianId)
        throw new errors_1.ConflictError('service_technician_required', 'Сначала назначьте мастера');
    if (MANAGER_ROLES.has(staff.role))
        return;
    if (!technicianId || actor !== technicianId || staff.point !== point || !['service', 'technician'].includes(staff.role)) {
        throw new errors_1.ConflictError('service_technician_forbidden', 'Ремонт выполняет назначенный мастер этой точки');
    }
}
async function activeStaff(tx, actor) {
    const staff = await tx.staffUser.findUnique({ where: { id: actor }, select: { id: true, role: true, point: true, active: true } });
    if (!staff?.active)
        throw new errors_1.ValidationError('staff_inactive', 'Сотрудник не найден или отключён');
    return staff;
}
async function recordCommand(tx, key, workOrderId, action, request, response) {
    await tx.serviceWorkOrderCommand.create({
        data: { idempotencyKey: key, workOrderId, action, request: (0, service_command_1.serviceJson)(request), response: (0, service_command_1.serviceJson)(response) },
    });
}
//# sourceMappingURL=service-execution.service.js.map