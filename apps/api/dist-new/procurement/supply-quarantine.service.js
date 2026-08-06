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
exports.SupplyQuarantineService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const PUBLIC_SELECT = {
    id: true,
    orderLineSupplyId: true,
    productId: true,
    storePointId: true,
    inventoryLocationSnapshot: true,
    trackingModeSnapshot: true,
    quarantinedQty: true,
    imeis: true,
    status: true,
    disposition: true,
    proposalReason: true,
    proposedBy: true,
    resolutionReason: true,
    resolvedBy: true,
    inventoryMovementId: true,
    createdAt: true,
    resolvedAt: true,
};
let SupplyQuarantineService = class SupplyQuarantineService {
    constructor(prisma, audit, config) {
        this.prisma = prisma;
        this.audit = audit;
        this.config = config;
    }
    async propose(orderItemId, dto, actor, idempotencyKey) {
        this.assertEnabled();
        const reason = normalizeReason(dto.reason);
        const evidence = normalizeEvidence(dto.evidence);
        const imeis = normalizeImeis(dto.imeis);
        const proposalHash = hashRequest({ orderItemId, reason, evidence, imeis });
        const replay = await this.prisma.supplyQuarantineResolution.findUnique({
            where: { proposalIdempotencyKey: idempotencyKey },
            select: { ...PUBLIC_SELECT, proposalHash: true },
        });
        if (replay)
            return replayProposal(replay, proposalHash);
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "OrderItem" WHERE id = ${orderItemId} FOR UPDATE`;
            const lockedReplay = await tx.supplyQuarantineResolution.findUnique({
                where: { proposalIdempotencyKey: idempotencyKey },
                select: { ...PUBLIC_SELECT, proposalHash: true },
            });
            if (lockedReplay)
                return { result: replayProposal(lockedReplay, proposalHash), events: [] };
            const item = await tx.orderItem.findUnique({
                where: { id: orderItemId },
                include: {
                    orderLineSupply: {
                        include: {
                            quantityAllocations: { where: { active: true } },
                            purchaseOrderItem: {
                                include: { purchaseOrder: { select: { location: true } } },
                            },
                        },
                    },
                    product: { select: { id: true, trackingMode: true } },
                },
            });
            if (!item)
                throw new errors_1.ValidationError('order_item_not_found', `Строка заказа ${orderItemId} не найдена`);
            if (item.supplyModeSnapshot !== 'to_order' || !item.orderLineSupply) {
                throw new errors_1.ConflictError('supply_quarantine_requires_to_order', 'В quarantine можно поместить только физически принятый товар из строки «под заказ»');
            }
            const supply = item.orderLineSupply;
            const poItem = supply.purchaseOrderItem;
            if (!poItem || supply.receivedQty <= 0 || poItem.receivedQty < supply.receivedQty) {
                throw new errors_1.ConflictError('supply_quarantine_not_physically_received', 'Нельзя поместить товар в quarantine до его физической приёмки');
            }
            if (!['received', 'quality_check', 'ready', 'customer_cancelled', 'quarantined'].includes(supply.status)) {
                throw new errors_1.ConflictError('supply_quarantine_invalid_state', `Поставка в статусе ${supply.status} ещё не готова к quarantine`);
            }
            if (!item.product)
                throw new errors_1.ConflictError('supply_quarantine_product_missing', 'У строки отсутствует товар');
            const location = poItem.purchaseOrder.location.trim();
            await tx.$queryRaw `SELECT id FROM "StorePoint" WHERE "inventoryLocation" = ${location} FOR SHARE`;
            const storePoint = await tx.storePoint.findUnique({
                where: { inventoryLocation: location },
                select: { id: true, active: true },
            });
            if (!storePoint?.active) {
                throw new errors_1.ConflictError('supply_quarantine_store_point_required', 'Склад PO должен соответствовать активной торговой точке');
            }
            if (item.product.trackingMode === 'serialized') {
                if (imeis.length !== supply.receivedQty) {
                    throw new errors_1.ValidationError('supply_quarantine_imeis_required', 'Для серийной поставки нужно передать все принятые IMEI');
                }
                await tx.$queryRaw `SELECT id FROM "DeviceUnit" WHERE imei IN (${client_1.Prisma.join(imeis)}) FOR UPDATE`;
                const units = await tx.deviceUnit.count({
                    where: {
                        imei: { in: imeis },
                        productId: item.product.id,
                        orderId: item.orderId,
                        location,
                        status: { in: ['reserved', 'quarantined'] },
                    },
                });
                if (units !== imeis.length) {
                    throw new errors_1.ConflictError('supply_quarantine_units_mismatch', 'IMEI не совпадают с зарезервированными единицами клиентской поставки');
                }
            }
            else if (imeis.length > 0) {
                throw new errors_1.ValidationError('supply_quarantine_quantity_has_no_imei', 'Для количественного товара IMEI передавать нельзя');
            }
            else {
                const allocations = supply.quantityAllocations;
                if (allocations.reduce((sum, allocation) => sum + allocation.qty, 0) !== supply.receivedQty
                    || allocations.some((allocation) => (allocation.productId !== item.product.id
                        || allocation.location !== location
                        || allocation.unitCost !== poItem.unitCost))) {
                    throw new errors_1.ConflictError('supply_quarantine_quantity_allocation_mismatch', 'Количественная поставка не совпадает с клиентскими складскими аллокациями');
                }
            }
            if (await tx.supplyQuarantineResolution.findUnique({ where: { orderLineSupplyId: supply.id } })) {
                throw new errors_1.ConflictError('supply_quarantine_already_proposed', 'Для этой строки уже создано quarantine-решение');
            }
            const resolution = await tx.supplyQuarantineResolution.create({
                data: {
                    orderLineSupplyId: supply.id,
                    productId: item.product.id,
                    storePointId: storePoint.id,
                    inventoryLocationSnapshot: location,
                    trackingModeSnapshot: item.product.trackingMode,
                    quarantinedQty: supply.receivedQty,
                    unitCostSnapshot: poItem.unitCost,
                    imeis: imeis.length ? imeis : client_1.Prisma.DbNull,
                    proposalReason: reason,
                    proposalEvidence: evidence,
                    proposedBy: actor,
                    proposalIdempotencyKey: idempotencyKey,
                    proposalHash,
                },
                select: PUBLIC_SELECT,
            });
            if (item.product.trackingMode === 'serialized') {
                const changed = await tx.deviceUnit.updateMany({
                    where: { imei: { in: imeis }, status: 'reserved' },
                    data: { status: 'quarantined', supplyQuarantineResolutionId: resolution.id },
                });
                if (changed.count !== imeis.length) {
                    throw new errors_1.ConflictError('supply_quarantine_unit_race', 'Статус одной из серийных единиц изменился параллельно');
                }
            }
            if (supply.status !== 'quarantined') {
                const changed = await tx.orderLineSupply.updateMany({
                    where: { id: supply.id, status: supply.status },
                    data: { status: 'quarantined', actor },
                });
                if (changed.count !== 1) {
                    throw new errors_1.ConflictError('supply_quarantine_state_race', 'Статус поставки изменился параллельно');
                }
            }
            await tx.orderItem.update({ where: { id: item.id }, data: { fulfillmentStatus: 'quarantined' } });
            return {
                result: { ...resolution, idempotent: false },
                events: [{
                        type: event_types_1.EventType.SupplyQuarantineProposed,
                        actor,
                        payload: {
                            resolutionId: resolution.id,
                            orderId: item.orderId,
                            orderItemId,
                            productId: item.product.id,
                            trackingMode: item.product.trackingMode,
                            quantity: supply.receivedQty,
                            location,
                        },
                        refs: [resolution.id, item.orderId, orderItemId, item.product.id],
                    }],
            };
        });
    }
    async resolve(resolutionId, dto, actor, role, idempotencyKey) {
        this.assertEnabled();
        if (role !== 'owner' && role !== 'admin') {
            throw new errors_1.ForbiddenError('supply_quarantine_owner_required', 'Решение quarantine может принять только владелец или администратор');
        }
        const reason = normalizeReason(dto.reason);
        const evidence = normalizeEvidence(dto.evidence);
        const resolutionHash = hashRequest({ resolutionId, disposition: dto.disposition, reason, evidence });
        const replay = await this.prisma.supplyQuarantineResolution.findUnique({
            where: { resolutionIdempotencyKey: idempotencyKey },
            select: { ...PUBLIC_SELECT, resolutionHash: true },
        });
        if (replay)
            return replayResolution(replay, resolutionHash);
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "SupplyQuarantineResolution" WHERE id = ${resolutionId} FOR UPDATE`;
            const lockedReplay = await tx.supplyQuarantineResolution.findUnique({
                where: { resolutionIdempotencyKey: idempotencyKey },
                select: { ...PUBLIC_SELECT, resolutionHash: true },
            });
            if (lockedReplay)
                return { result: replayResolution(lockedReplay, resolutionHash), events: [] };
            const resolution = await tx.supplyQuarantineResolution.findUnique({
                where: { id: resolutionId },
                include: {
                    orderLineSupply: {
                        include: {
                            orderItem: { select: { id: true, orderId: true, supplyModeSnapshot: true } },
                            quantityAllocations: { where: { active: true } },
                        },
                    },
                },
            });
            if (!resolution)
                throw new errors_1.ValidationError('supply_quarantine_not_found', `Quarantine-решение ${resolutionId} не найдено`);
            if (resolution.status !== 'pending') {
                throw new errors_1.ConflictError('supply_quarantine_already_resolved', 'Quarantine уже разрешён другой командой');
            }
            if (resolution.orderLineSupply.status !== 'quarantined'
                || resolution.orderLineSupply.orderItem.supplyModeSnapshot !== 'to_order') {
                throw new errors_1.ConflictError('supply_quarantine_invalid_resolution_state', 'Поставка больше не находится в допустимом quarantine-состоянии');
            }
            const movementId = dto.disposition === 'convert_to_own_stock'
                ? await this.convertToOwnStock(tx, resolution, idempotencyKey)
                : await this.returnToSupplier(tx, resolution);
            await this.consumeQuantityAllocationsOnTx(tx, resolution);
            const changed = await tx.supplyQuarantineResolution.updateMany({
                where: { id: resolution.id, status: 'pending' },
                data: {
                    status: 'resolved',
                    disposition: dto.disposition,
                    resolutionReason: reason,
                    resolutionEvidence: evidence,
                    resolvedBy: actor,
                    resolutionIdempotencyKey: idempotencyKey,
                    resolutionHash,
                    inventoryMovementId: movementId,
                    resolvedAt: new Date(),
                },
            });
            if (changed.count !== 1) {
                throw new errors_1.ConflictError('supply_quarantine_resolution_race', 'Quarantine был разрешён параллельно');
            }
            await tx.orderLineSupply.update({
                where: { id: resolution.orderLineSupplyId },
                data: { status: 'cancelled', actor },
            });
            await tx.orderItem.update({
                where: { id: resolution.orderLineSupply.orderItem.id },
                data: { fulfillmentStatus: 'cancelled' },
            });
            const updated = await tx.supplyQuarantineResolution.findUniqueOrThrow({
                where: { id: resolution.id },
                select: PUBLIC_SELECT,
            });
            const events = [{
                    type: event_types_1.EventType.SupplyQuarantineResolved,
                    actor,
                    payload: {
                        resolutionId: resolution.id,
                        orderId: resolution.orderLineSupply.orderItem.orderId,
                        orderItemId: resolution.orderLineSupply.orderItem.id,
                        productId: resolution.productId,
                        disposition: dto.disposition,
                        quantity: resolution.quarantinedQty,
                        location: resolution.inventoryLocationSnapshot,
                        inventoryMovementId: movementId,
                    },
                    refs: [
                        resolution.id,
                        resolution.orderLineSupply.orderItem.orderId,
                        resolution.orderLineSupply.orderItem.id,
                        resolution.productId,
                        ...(movementId ? [movementId] : []),
                    ],
                }];
            if (dto.disposition === 'convert_to_own_stock') {
                events.push({
                    type: event_types_1.EventType.ProductSupplyModeChanged,
                    actor,
                    payload: {
                        productId: resolution.productId,
                        oldSupplyMode: 'to_order',
                        newSupplyMode: 'own_stock',
                        source: 'supply_quarantine_resolution',
                        resolutionId: resolution.id,
                    },
                    refs: [resolution.id, resolution.productId],
                });
            }
            return { result: { ...updated, idempotent: false }, events };
        });
    }
    assertEnabled() {
        if (this.config?.get('SUPPLY_QUARANTINE_CONVERSION_ENABLED')?.trim().toLowerCase() !== 'true') {
            throw new errors_1.ConflictError('supply_quarantine_conversion_disabled', 'Quarantine-конверсия пока не включена');
        }
    }
    async consumeQuantityAllocationsOnTx(tx, resolution) {
        if (resolution.trackingModeSnapshot !== 'quantity')
            return;
        const allocations = resolution.orderLineSupply.quantityAllocations;
        if (allocations.reduce((sum, allocation) => sum + allocation.qty, 0) !== resolution.quarantinedQty) {
            throw new errors_1.ConflictError('supply_quarantine_quantity_allocation_mismatch', 'Quarantine-количество не совпадает с активными клиентскими аллокациями');
        }
        const consumedAt = new Date();
        for (const allocation of allocations) {
            const issue = await tx.inventoryValuationIssue.create({
                data: {
                    productId: allocation.productId,
                    orderId: resolution.orderLineSupply.orderItem.orderId,
                    sourceType: 'supply-quantity.quarantine',
                    sourceRef: allocation.id,
                    location: allocation.location,
                    quantity: allocation.qty,
                    unitCost: allocation.unitCost,
                    totalCost: allocation.qty * allocation.unitCost,
                },
            });
            const changed = await tx.supplyQuantityAllocation.updateMany({
                where: { id: allocation.id, active: true, valuationIssueId: null },
                data: { active: false, consumedAt, valuationIssueId: issue.id },
            });
            if (changed.count !== 1) {
                throw new errors_1.ConflictError('supply_quarantine_quantity_allocation_race', 'Клиентская количественная аллокация изменилась параллельно');
            }
        }
    }
    async convertToOwnStock(tx, resolution, idempotencyKey) {
        await tx.$queryRaw `SELECT id FROM "Product" WHERE id = ${resolution.productId} FOR UPDATE`;
        await tx.$queryRaw `SELECT id FROM "StorePoint" WHERE id = ${resolution.storePointId} FOR SHARE`;
        const point = await tx.storePoint.findUnique({
            where: { id: resolution.storePointId },
            select: { active: true, inventoryLocation: true },
        });
        if (!point?.active || point.inventoryLocation !== resolution.inventoryLocationSnapshot) {
            throw new errors_1.ConflictError('supply_quarantine_location_changed', 'Торговая точка деактивирована или её складская идентичность изменилась');
        }
        const movement = await tx.inventoryMovement.create({
            data: {
                idempotencyKey: `supply-quarantine:${idempotencyKey}`,
                productId: resolution.productId,
                qty: resolution.quarantinedQty,
                type: 'to_order_conversion',
                to: resolution.inventoryLocationSnapshot,
                reason: `Owner conversion ${resolution.id}`,
                unitCost: resolution.unitCostSnapshot,
                totalValue: resolution.quarantinedQty * resolution.unitCostSnapshot,
            },
            select: { id: true },
        });
        if (resolution.trackingModeSnapshot === 'serialized') {
            const imeis = jsonImeis(resolution.imeis);
            await tx.$queryRaw `SELECT id FROM "DeviceUnit" WHERE imei IN (${client_1.Prisma.join(imeis)}) FOR UPDATE`;
            const changed = await tx.deviceUnit.updateMany({
                where: {
                    supplyQuarantineResolutionId: resolution.id,
                    imei: { in: imeis },
                    status: 'quarantined',
                },
                data: { status: 'in_stock', orderId: null },
            });
            if (changed.count !== resolution.quarantinedQty) {
                throw new errors_1.ConflictError('supply_quarantine_unit_race', 'Не все quarantined IMEI доступны для конвертации');
            }
        }
        else {
            const value = resolution.quarantinedQty * resolution.unitCostSnapshot;
            const balance = await tx.inventoryBalance.upsert({
                where: {
                    productId_location: {
                        productId: resolution.productId,
                        location: resolution.inventoryLocationSnapshot,
                    },
                },
                create: {
                    productId: resolution.productId,
                    location: resolution.inventoryLocationSnapshot,
                    onHand: resolution.quarantinedQty,
                    inventoryValue: value,
                },
                update: {
                    onHand: { increment: resolution.quarantinedQty },
                    inventoryValue: { increment: value },
                },
                select: { id: true },
            });
            await tx.inventoryValuationLayer.create({
                data: {
                    productId: resolution.productId,
                    balanceId: balance.id,
                    location: resolution.inventoryLocationSnapshot,
                    sourceType: 'supply_quarantine_conversion',
                    sourceRef: resolution.id,
                    unitCost: resolution.unitCostSnapshot,
                    quantityReceived: resolution.quarantinedQty,
                    quantityRemaining: resolution.quarantinedQty,
                },
            });
        }
        await tx.product.update({
            where: { id: resolution.productId },
            data: { supplyMode: 'own_stock', supplyLeadDays: null },
        });
        await tx.supplierOffer.updateMany({
            where: { productId: resolution.productId, active: true },
            data: { active: false },
        });
        return movement.id;
    }
    async returnToSupplier(tx, resolution) {
        if (resolution.trackingModeSnapshot === 'serialized') {
            const imeis = jsonImeis(resolution.imeis);
            await tx.$queryRaw `SELECT id FROM "DeviceUnit" WHERE imei IN (${client_1.Prisma.join(imeis)}) FOR UPDATE`;
            const changed = await tx.deviceUnit.updateMany({
                where: {
                    supplyQuarantineResolutionId: resolution.id,
                    imei: { in: imeis },
                    status: 'quarantined',
                },
                data: { status: 'returned_supplier' },
            });
            if (changed.count !== resolution.quarantinedQty) {
                throw new errors_1.ConflictError('supply_quarantine_unit_race', 'Не все quarantined IMEI доступны для возврата поставщику');
            }
        }
        return null;
    }
};
exports.SupplyQuarantineService = SupplyQuarantineService;
exports.SupplyQuarantineService = SupplyQuarantineService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        config_1.ConfigService])
], SupplyQuarantineService);
function normalizeReason(reason) {
    const normalized = reason.trim();
    if (normalized.length < 3) {
        throw new errors_1.ValidationError('supply_quarantine_reason_required', 'Укажите содержательную причину минимум из трёх символов');
    }
    return normalized;
}
function normalizeEvidence(evidence) {
    if (!evidence || Array.isArray(evidence) || typeof evidence !== 'object' || Object.keys(evidence).length === 0) {
        throw new errors_1.ValidationError('supply_quarantine_evidence_required', 'Для quarantine требуется непустое подтверждение');
    }
    return evidence;
}
function normalizeImeis(input) {
    const imeis = (input ?? []).map((imei) => imei.trim()).filter(Boolean).sort();
    if (new Set(imeis).size !== imeis.length) {
        throw new errors_1.ValidationError('supply_quarantine_duplicate_imei', 'IMEI в quarantine-запросе не должны повторяться');
    }
    return imeis;
}
function hashRequest(value) {
    return (0, node_crypto_1.createHash)('sha256').update(stableJson(value)).digest('hex');
}
function stableJson(value) {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}
function replayProposal(replay, expectedHash) {
    if (replay.proposalHash !== expectedHash) {
        throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован с другим quarantine-запросом');
    }
    const { proposalHash: _proposalHash, ...result } = replay;
    return { ...result, idempotent: true };
}
function replayResolution(replay, expectedHash) {
    if (replay.resolutionHash !== expectedHash) {
        throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован с другим решением quarantine');
    }
    const { resolutionHash: _resolutionHash, ...result } = replay;
    return { ...result, idempotent: true };
}
function jsonImeis(value) {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string') || value.length === 0) {
        throw new errors_1.ConflictError('supply_quarantine_imei_snapshot_invalid', 'Снимок IMEI quarantine повреждён или отсутствует');
    }
    return value;
}
//# sourceMappingURL=supply-quarantine.service.js.map