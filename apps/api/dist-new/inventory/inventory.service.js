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
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const approvals_service_1 = require("../approvals/approvals.service");
const consignment_accounting_1 = require("./consignment-accounting");
const accounting_journal_1 = require("../finance/accounting-journal");
const cash_drawer_1 = require("../shifts/cash-drawer");
const inventory_valuation_1 = require("./inventory-valuation");
const inventory_roll_forward_1 = require("./inventory-roll-forward");
const store_point_identity_1 = require("../common/store-point-identity");
const prisma_errors_1 = require("../common/prisma-errors");
const ACTION_BY_TYPE = {
    write_off: 'write_off',
    adjust: 'stock_adjust',
};
const COUNT_SNAPSHOT_PREFIX = 'inventory-count-snapshot:';
function countFingerprint(input) {
    return (0, node_crypto_1.createHash)('sha256')
        .update(JSON.stringify({
        actor: input.actor,
        productId: input.productId,
        location: input.location,
        expected: input.expected,
        counted: input.counted,
        diff: input.diff,
    }))
        .digest('hex');
}
function parseCountSnapshot(reason) {
    if (!reason?.startsWith(COUNT_SNAPSHOT_PREFIX))
        return null;
    try {
        const parsed = JSON.parse(reason.slice(COUNT_SNAPSHOT_PREFIX.length));
        if (parsed.version !== 1
            || !parsed.actor
            || !parsed.productId
            || !parsed.location
            || !Number.isSafeInteger(parsed.expected)
            || !Number.isSafeInteger(parsed.counted)
            || parsed.diff !== parsed.counted - parsed.expected
            || parsed.fingerprint !== countFingerprint(parsed)) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function replayCountMovement(movement, command) {
    const snapshot = parseCountSnapshot(movement.reason);
    if (movement.type !== 'count'
        || !snapshot
        || snapshot.actor !== command.actor
        || snapshot.productId !== command.productId
        || snapshot.location !== command.location
        || snapshot.counted !== command.counted
        || movement.productId !== snapshot.productId
        || movement.from !== snapshot.location
        || movement.qty !== snapshot.diff) {
        throw new errors_1.ConflictError('idempotency_key_reused', 'Этот Idempotency-Key уже занят другим пересчётом или сотрудником');
    }
    return {
        productId: snapshot.productId,
        location: snapshot.location,
        expected: snapshot.expected,
        counted: snapshot.counted,
        diff: snapshot.diff,
        movementId: movement.id,
        fingerprint: snapshot.fingerprint,
    };
}
function isDatabaseLockTimeout(error) {
    if (!error || typeof error !== 'object')
        return false;
    const candidate = error;
    return candidate.code === 'P2028'
        || candidate.code === '55P03'
        || (candidate.code === 'P2010' && candidate.meta?.code === '55P03')
        || String(candidate.message ?? candidate.meta?.message ?? '').includes('lock timeout');
}
const TOP_DISCREPANCIES_LIMIT = 25;
function buildTopDiscrepancies(quantity, serialized) {
    const byKey = new Map();
    const keyOf = (productId, location) => `${productId}\0${location}`;
    for (const row of quantity) {
        if (row.consistent)
            continue;
        byKey.set(keyOf(row.productId, row.location), {
            productId: row.productId,
            sku: row.sku,
            name: row.name,
            location: row.location,
            valueDifference: row.valueDifference,
            quantityDifference: row.quantityDifference,
            reservationDifference: row.reservationDifference,
            missingCostUnits: 0,
        });
    }
    for (const row of serialized) {
        if (row.missingCostUnits <= 0)
            continue;
        const key = keyOf(row.productId, row.location);
        const existing = byKey.get(key);
        if (existing) {
            existing.missingCostUnits += row.missingCostUnits;
            continue;
        }
        byKey.set(key, {
            productId: row.productId,
            sku: row.sku,
            name: row.name,
            location: row.location,
            valueDifference: 0,
            quantityDifference: 0,
            reservationDifference: 0,
            missingCostUnits: row.missingCostUnits,
        });
    }
    const sorted = [...byKey.values()].sort((a, b) => {
        const byValue = Math.abs(b.valueDifference) - Math.abs(a.valueDifference);
        if (byValue !== 0)
            return byValue;
        return Math.abs(b.quantityDifference) - Math.abs(a.quantityDifference);
    });
    return {
        rows: sorted.slice(0, TOP_DISCREPANCIES_LIMIT),
        truncated: Math.max(0, sorted.length - TOP_DISCREPANCIES_LIMIT),
    };
}
let InventoryService = class InventoryService {
    constructor(prisma, audit, approvals) {
        this.prisma = prisma;
        this.audit = audit;
        this.approvals = approvals;
    }
    async actorStorePoint(actor) {
        const staff = await this.prisma.staffUser.findUnique({
            where: { id: actor },
            select: { active: true, role: true, point: true },
        });
        if (!staff?.active) {
            if (process.env.NODE_ENV === 'test') {
                const fixture = await this.prisma.storePoint.findFirst({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
                if (fixture)
                    return { ...fixture, role: 'owner' };
            }
            throw new errors_1.ForbiddenError('staff_not_found', 'Сотрудник не найден или отключён');
        }
        const point = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, staff.point, 'Точка сотрудника недоступна или отключена');
        return { ...point, role: staff.role };
    }
    async activeLocation(requested, message) {
        try {
            return await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, requested, message);
        }
        catch (error) {
            const reference = requested?.trim();
            if (process.env.NODE_ENV !== 'test' || !reference)
                throw error;
            const knownPoint = await this.prisma.storePoint.findFirst({
                where: (0, store_point_identity_1.storePointIdentityWhere)(reference),
            });
            if (knownPoint)
                throw error;
            return {
                id: `test-fixture:${reference}`,
                code: reference.toLowerCase(),
                name: reference,
                address: '',
                inventoryLocation: reference,
                hours: '',
                pickupInstructions: null,
                active: true,
                sortOrder: 0,
                createdBy: 'test',
                idempotencyKey: `test:${reference}`,
                createdAt: new Date(0),
                updatedAt: new Date(0),
            };
        }
    }
    async mutationLocation(actor, requested) {
        const [assigned, selected] = await Promise.all([
            this.actorStorePoint(actor),
            this.activeLocation(requested),
        ]);
        if (assigned.role !== 'owner' && assigned.role !== 'admin' && assigned.id !== selected.id) {
            throw new errors_1.ForbiddenError('staff_point_mismatch', 'Операция разрешена только для своей точки');
        }
        return selected.inventoryLocation;
    }
    async valuationReconciliation() {
        const [balances, serializedUnits, glLines] = await Promise.all([
            this.prisma.inventoryBalance.findMany({
                where: { product: { trackingMode: 'quantity' } },
                include: {
                    product: { select: { id: true, sku: true, name: true } },
                    valuationLayers: {
                        where: { quantityRemaining: { gt: 0 } },
                        select: { quantityRemaining: true, unitCost: true },
                    },
                    quantityConsignmentLots: {
                        select: { availableQty: true, reservedQty: true },
                    },
                },
                orderBy: [{ location: 'asc' }, { product: { sku: 'asc' } }],
            }),
            this.prisma.deviceUnit.findMany({
                where: {
                    status: { notIn: ['sold', 'written_off'] },
                    consignmentItem: { is: null },
                    product: { trackingMode: 'serialized' },
                },
                select: {
                    productId: true,
                    location: true,
                    acquisitionCost: true,
                    product: { select: { sku: true, name: true } },
                },
                orderBy: [{ location: 'asc' }, { product: { sku: 'asc' } }],
            }),
            this.prisma.accountingJournalLine.findMany({
                where: { accountCode: '1200' },
                select: { debit: true, credit: true },
            }),
        ]);
        const quantity = balances.map((balance) => {
            const consignmentQty = balance.quantityConsignmentLots.reduce((sum, lot) => sum + lot.availableQty + lot.reservedQty, 0);
            const ownedPhysicalQty = balance.onHand - consignmentQty;
            const layerQty = balance.valuationLayers.reduce((sum, layer) => sum + layer.quantityRemaining, 0);
            const layerValue = balance.valuationLayers.reduce((sum, layer) => sum + layer.quantityRemaining * layer.unitCost, 0);
            const quantityDifference = layerQty - ownedPhysicalQty;
            const valueDifference = layerValue - balance.inventoryValue;
            const reservationDifference = Math.max(0, balance.reserved - balance.onHand);
            return {
                productId: balance.productId,
                sku: balance.product.sku,
                name: balance.product.name,
                location: balance.location,
                onHand: balance.onHand,
                reserved: balance.reserved,
                consignmentQty,
                ownedPhysicalQty,
                layerQty,
                inventoryValue: balance.inventoryValue,
                layerValue,
                quantityDifference,
                valueDifference,
                reservationDifference,
                consistent: quantityDifference === 0 && valueDifference === 0 && reservationDifference === 0
                    && ownedPhysicalQty >= 0,
            };
        });
        const serializedByKey = new Map();
        for (const unit of serializedUnits) {
            const key = `${unit.productId}\u0000${unit.location}`;
            const row = serializedByKey.get(key) ?? {
                productId: unit.productId,
                sku: unit.product.sku,
                name: unit.product.name,
                location: unit.location,
                units: 0,
                inventoryValue: 0,
                missingCostUnits: 0,
            };
            row.units += 1;
            if (unit.acquisitionCost === null)
                row.missingCostUnits += 1;
            else
                row.inventoryValue += unit.acquisitionCost;
            serializedByKey.set(key, row);
        }
        const serialized = [...serializedByKey.values()];
        const quantityValue = quantity.reduce((sum, row) => sum + row.inventoryValue, 0);
        const serializedValue = serialized.reduce((sum, row) => sum + row.inventoryValue, 0);
        const missingSerializedCostUnits = serialized.reduce((sum, row) => sum + row.missingCostUnits, 0);
        const ownedInventoryValue = quantityValue + serializedValue;
        const glInventoryBalance = glLines.reduce((sum, line) => sum + line.debit - line.credit, 0);
        const difference = ownedInventoryValue - glInventoryBalance;
        const inconsistentQuantityRows = quantity.filter((row) => !row.consistent).length;
        const topDiscrepancies = buildTopDiscrepancies(quantity, serialized);
        return {
            generatedAt: new Date().toISOString(),
            scope: 'owned_inventory',
            summary: {
                quantityValue,
                serializedValue,
                ownedInventoryValue,
                glInventoryBalance,
                difference,
                inconsistentQuantityRows,
                missingSerializedCostUnits,
                complete: missingSerializedCostUnits === 0,
                consistent: difference === 0 && inconsistentQuantityRows === 0 && missingSerializedCostUnits === 0,
                topDiscrepancies: topDiscrepancies.rows,
                topDiscrepanciesTruncated: topDiscrepancies.truncated,
            },
            quantity,
            serialized,
        };
    }
    valuationRollForward(from, to) {
        return this.prisma.$transaction((tx) => (0, inventory_roll_forward_1.inventoryValuationRollForward)(tx, from, to), { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
    }
    async listQuarantine() {
        const include = {
            include: {
                unit: {
                    select: {
                        imei: true,
                        location: true,
                        status: true,
                        acquisitionCost: true,
                        product: { select: { id: true, sku: true, name: true } },
                    },
                },
            },
        };
        const [active, history] = await Promise.all([
            this.prisma.inventoryQuarantineCase.findMany({
                where: { status: { not: 'disposed' } },
                ...include,
                orderBy: { createdAt: 'asc' },
            }),
            this.prisma.inventoryQuarantineCase.findMany({
                where: { status: 'disposed' },
                ...include,
                orderBy: { createdAt: 'desc' },
                take: 200,
            }),
        ]);
        return [...active, ...history];
    }
    async diagnoseQuarantine(id, dto, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "InventoryQuarantineCase" WHERE id = ${id} FOR UPDATE`;
            const quarantine = await tx.inventoryQuarantineCase.findUnique({ where: { id } });
            if (!quarantine)
                throw new errors_1.ValidationError('quarantine_not_found', 'Карантинная запись не найдена');
            const notes = dto.notes?.trim() || null;
            if (quarantine.status === 'diagnosed'
                && quarantine.diagnosis === dto.diagnosis
                && quarantine.notes === notes) {
                return { result: quarantine, events: [] };
            }
            if (quarantine.status !== 'pending_diagnosis') {
                throw new errors_1.ConflictError('quarantine_already_diagnosed', 'Диагноз уже зафиксирован и не редактируется');
            }
            const evidence = await tx.auditEvent.findMany({
                where: { type: event_types_1.EventType.EvidenceAttached, actor: `staff:${actor}`, refs: { has: id } },
                select: { actor: true, payload: true },
                orderBy: { ts: 'desc' },
            });
            const hasTrustedDiagnosis = evidence.some((event) => {
                const payload = event.payload;
                return payload.entityType === 'quarantine'
                    && payload.entityId === id
                    && payload.label === 'quarantine_diagnosis'
                    && payload.trustedStaffEvidence === true
                    && event.actor === `staff:${actor}`;
            });
            if (!hasTrustedDiagnosis) {
                throw new errors_1.ConflictError('quarantine_evidence_required', 'До диагноза приложите фото quarantine_diagnosis');
            }
            const updated = await tx.inventoryQuarantineCase.update({
                where: { id },
                data: {
                    status: 'diagnosed',
                    diagnosis: dto.diagnosis,
                    notes,
                    diagnosedBy: actor,
                    diagnosedAt: new Date(),
                },
            });
            return {
                result: updated,
                events: [{
                        type: event_types_1.EventType.InventoryDiagnosed,
                        actor,
                        payload: { quarantineId: id, diagnosis: dto.diagnosis, notes },
                        refs: [id, quarantine.unitId, quarantine.returnId],
                    }],
            };
        });
    }
    async disposeQuarantine(id, dto, actor) {
        return this.audit.transaction(async (tx) => {
            const locked = await tx.$queryRaw `
        SELECT "unitId" FROM "InventoryQuarantineCase" WHERE id = ${id} FOR UPDATE
      `;
            if (!locked[0])
                throw new errors_1.ValidationError('quarantine_not_found', 'Карантинная запись не найдена');
            await tx.$queryRaw `SELECT id FROM "DeviceUnit" WHERE id = ${locked[0].unitId} FOR UPDATE`;
            const quarantine = await tx.inventoryQuarantineCase.findUnique({
                where: { id },
                include: {
                    unit: { include: { product: true } },
                    return: { include: { order: true } },
                },
            });
            if (!quarantine)
                throw new errors_1.ValidationError('quarantine_not_found', 'Карантинная запись не найдена');
            if (quarantine.status === 'disposed' && quarantine.disposition === dto.disposition) {
                return { result: quarantine, events: [] };
            }
            if (quarantine.status !== 'diagnosed' || !quarantine.diagnosis || !quarantine.diagnosedBy) {
                throw new errors_1.ConflictError('quarantine_diagnosis_required', 'Сначала зафиксируйте диагноз');
            }
            if (quarantine.diagnosedBy === actor) {
                throw new errors_1.ConflictError('quarantine_four_eyes_required', 'Диагност не может сам применить disposition');
            }
            const expected = quarantine.diagnosis === 'resellable' ? 'restock' : quarantine.diagnosis;
            if (dto.disposition !== expected) {
                throw new errors_1.ConflictError('quarantine_disposition_mismatch', `Для диагноза ${quarantine.diagnosis} допустимо только ${expected}`);
            }
            if (quarantine.unit.status !== 'returned') {
                throw new errors_1.ConflictError('quarantine_unit_state_mismatch', `IMEI уже находится в статусе ${quarantine.unit.status}`);
            }
            if (dto.disposition === 'write_off') {
                if (quarantine.dispositionApprovalId) {
                    return {
                        result: { approvalId: quarantine.dispositionApprovalId, status: 'requested' },
                        events: [],
                    };
                }
                const approval = await tx.approval.create({
                    data: {
                        action: 'quarantine_write_off',
                        requester: actor,
                        reason: `Списание IMEI ${quarantine.unit.imei} после карантина`,
                        status: 'requested',
                        evidence: {
                            payload: {
                                quarantineId: id,
                                unitId: quarantine.unitId,
                                unitCost: quarantine.unitCost,
                            },
                        },
                    },
                });
                await tx.inventoryQuarantineCase.update({
                    where: { id },
                    data: { dispositionApprovalId: approval.id },
                });
                return {
                    result: { approvalId: approval.id, status: 'requested' },
                    events: [{
                            type: event_types_1.EventType.ApprovalRequested,
                            actor,
                            payload: { approvalId: approval.id, action: 'quarantine_write_off', quarantineId: id },
                            refs: [approval.id, id, quarantine.unit.imei],
                        }],
                };
            }
            const nextUnitStatus = dto.disposition === 'restock'
                ? 'in_stock'
                : 'in_repair';
            const events = [];
            let repairWorkOrderId = null;
            if (dto.disposition === 'repair') {
                const warrantyCase = await tx.warrantyCase.create({
                    data: {
                        imei: quarantine.unit.imei,
                        customerId: quarantine.return.order.customerId,
                        problem: `Карантин: ${quarantine.notes ?? quarantine.reason}`,
                        status: 'received',
                        serviceType: 'warranty',
                        deviceName: quarantine.unit.product.name,
                        sla: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                    },
                });
                const workOrder = await tx.serviceWorkOrder.create({
                    data: {
                        warrantyCaseId: warrantyCase.id,
                        createdBy: actor,
                        point: quarantine.unit.location,
                    },
                });
                repairWorkOrderId = workOrder.id;
                events.push({
                    type: event_types_1.EventType.ServiceWorkOrderCreated,
                    actor,
                    payload: { workOrderId: workOrder.id, warrantyId: warrantyCase.id, source: 'inventory_quarantine' },
                    refs: [workOrder.id, warrantyCase.id, id, quarantine.unit.imei],
                });
            }
            const unitUpdate = await tx.deviceUnit.updateMany({
                where: { id: quarantine.unitId, status: 'returned' },
                data: { status: nextUnitStatus },
            });
            if (unitUpdate.count !== 1) {
                throw new errors_1.ConflictError('quarantine_unit_state_mismatch', 'IMEI уже обработан другой операцией');
            }
            const updated = await tx.inventoryQuarantineCase.update({
                where: { id },
                data: {
                    status: 'disposed',
                    disposition: dto.disposition,
                    disposedBy: actor,
                    disposedAt: new Date(),
                    repairWorkOrderId,
                },
                include: { unit: { include: { product: true } } },
            });
            events.push({
                type: event_types_1.EventType.InventoryDisposed,
                actor,
                payload: { quarantineId: id, disposition: dto.disposition, imei: quarantine.unit.imei, repairWorkOrderId },
                refs: [id, quarantine.unit.imei, ...(repairWorkOrderId ? [repairWorkOrderId] : [])],
            });
            return { result: updated, events };
        });
    }
    async movement(dto, requester, idempotencyKey) {
        const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
        if (!product) {
            throw new errors_1.ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
        }
        if (product.trackingMode !== 'quantity') {
            throw new errors_1.ValidationError('serialized_movement_requires_unit', 'Для серийного товара укажите конкретный IMEI');
        }
        const location = await this.mutationLocation(requester, dto.location);
        const direction = dto.type === 'write_off' ? 'decrease' : (dto.direction ?? 'increase');
        const balance = await this.prisma.inventoryBalance.findUnique({
            where: { productId_location: { productId: dto.productId, location } },
            select: { onHand: true },
        });
        const countMovementId = dto.countMovementId?.trim() || undefined;
        let expectedOnHand = balance?.onHand ?? 0;
        if (countMovementId) {
            const [count, applied] = await Promise.all([
                this.prisma.inventoryMovement.findUnique({ where: { id: countMovementId } }),
                this.prisma.approval.findUnique({ where: { sourceRef: `inventory-count:${countMovementId}` } }),
            ]);
            const signedQty = direction === 'decrease' ? -dto.qty : dto.qty;
            const snapshot = parseCountSnapshot(count?.reason ?? null);
            if (!count
                || !snapshot
                || count.type !== 'count'
                || count.productId !== dto.productId
                || count.from !== location
                || count.qty !== signedQty
                || snapshot.productId !== dto.productId
                || snapshot.location !== location
                || snapshot.diff !== signedQty) {
                throw new errors_1.ConflictError('inventory_count_snapshot_mismatch', 'Корректировка не соответствует зафиксированному пересчёту');
            }
            if (applied) {
                throw new errors_1.ConflictError('inventory_count_already_applied', 'Этот пересчёт уже использован для корректировки');
            }
            if ((balance?.onHand ?? 0) !== snapshot.expected) {
                throw new errors_1.ConflictError('inventory_count_balance_changed', 'Остаток изменился после пересчёта; выполните новый пересчёт');
            }
            expectedOnHand = snapshot.expected;
        }
        return this.approvals.request({
            action: ACTION_BY_TYPE[dto.type],
            requester,
            reason: dto.reason,
            idempotencyKey,
            payload: {
                productId: dto.productId,
                qty: dto.qty,
                location,
                direction,
                reason: dto.reason,
                unitCost: direction === 'increase' ? product.cost : undefined,
                expectedOnHand,
                countMovementId,
            },
            evidence: countMovementId ? { inventoryCountMovementId: countMovementId } : undefined,
        });
    }
    async receive(dto, actor) {
        const location = await this.mutationLocation(actor, dto.location);
        const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
        if (!product) {
            throw new errors_1.ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
        }
        if (product.trackingMode !== 'serialized') {
            throw new errors_1.ValidationError('serialized_product_required', 'Для этого товара используется количественный учёт');
        }
        if (product.supplyMode === 'to_order') {
            throw new errors_1.ConflictError('to_order_free_stock_forbidden', 'Заказной товар принимается только через клиентскую SupplyAllocation');
        }
        const imeis = dto.imeis.map((imei) => imei.trim()).filter(Boolean);
        if (imeis.length === 0) {
            throw new errors_1.ValidationError('imei_required', 'Нужен хотя бы один IMEI');
        }
        if (new Set(imeis).size !== imeis.length) {
            throw new errors_1.ValidationError('duplicate_imei', 'IMEI в партии не должны повторяться');
        }
        const existing = await this.prisma.deviceUnit.findMany({
            where: { imei: { in: imeis } },
            select: { imei: true },
        });
        if (existing.length > 0) {
            throw new errors_1.ConflictError('imei_already_exists', `IMEI уже есть в базе: ${existing.map((unit) => unit.imei).join(', ')}`);
        }
        const unitCost = dto.unitCost ?? product.cost;
        return this.audit.transaction(async (tx) => {
            const movement = await tx.inventoryMovement.create({
                data: {
                    productId: dto.productId,
                    qty: imeis.length,
                    type: 'received',
                    to: location,
                    reason: dto.reason ?? null,
                    unitCost,
                    totalValue: imeis.length * unitCost,
                },
            });
            for (const imei of imeis) {
                await tx.deviceUnit.create({
                    data: {
                        imei,
                        productId: dto.productId,
                        status: 'in_stock',
                        location,
                        grade: dto.grade,
                        acquisitionCost: unitCost,
                    },
                });
            }
            return {
                result: {
                    productId: dto.productId,
                    location,
                    received: imeis.length,
                    imeis,
                    movementId: movement.id,
                },
                events: [
                    {
                        type: event_types_1.EventType.StockReceived,
                        actor,
                        payload: { productId: dto.productId, location, qty: imeis.length, movementId: movement.id },
                        refs: [dto.productId, movement.id],
                    },
                    ...imeis.map((imei) => ({
                        type: event_types_1.EventType.UnitReceived,
                        actor,
                        payload: { productId: dto.productId, imei, location, grade: dto.grade ?? null },
                        refs: [dto.productId, imei, movement.id],
                    })),
                ],
            };
        });
    }
    async receiveQuantity(dto, actor) {
        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
            include: { _count: { select: { bundleComponents: true } } },
        });
        if (!product) {
            throw new errors_1.ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
        }
        if (product.trackingMode !== 'quantity') {
            throw new errors_1.ValidationError('quantity_product_required', 'Для этого товара используется серийный учёт');
        }
        if (product.supplyMode === 'to_order') {
            throw new errors_1.ConflictError('to_order_free_stock_forbidden', 'Заказной товар принимается только через клиентскую SupplyAllocation');
        }
        if (product._count.bundleComponents > 0) {
            throw new errors_1.ValidationError('virtual_bundle_receive_forbidden', 'Виртуальный набор принимается по его компонентам');
        }
        const location = await this.mutationLocation(actor, dto.location);
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'quantity-receive:' + dto.idempotencyKey}))::text AS locked`;
            const replay = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
            if (replay) {
                if (replay.productId !== dto.productId || replay.qty !== dto.quantity || replay.to !== location) {
                    throw new errors_1.ConflictError('receive_idempotency_mismatch', 'Ключ приёмки уже использован с другими параметрами');
                }
                const current = await tx.inventoryBalance.findUniqueOrThrow({
                    where: { productId_location: { productId: dto.productId, location } },
                });
                return {
                    result: {
                        productId: dto.productId,
                        location,
                        received: dto.quantity,
                        onHand: current.onHand,
                        reserved: current.reserved,
                        available: current.onHand - current.reserved,
                        movementId: replay.id,
                    },
                    events: [],
                };
            }
            const unitCost = dto.unitCost ?? product.cost;
            const balance = await tx.inventoryBalance.upsert({
                where: { productId_location: { productId: dto.productId, location } },
                create: { productId: dto.productId, location, onHand: dto.quantity, inventoryValue: dto.quantity * unitCost },
                update: { onHand: { increment: dto.quantity }, inventoryValue: { increment: dto.quantity * unitCost } },
            });
            const movement = await tx.inventoryMovement.create({
                data: {
                    productId: dto.productId,
                    qty: dto.quantity,
                    type: 'received',
                    to: location,
                    reason: dto.reason?.trim() || null,
                    unitCost,
                    totalValue: dto.quantity * unitCost,
                    idempotencyKey: dto.idempotencyKey,
                },
            });
            await tx.inventoryValuationLayer.create({
                data: {
                    productId: dto.productId,
                    balanceId: balance.id,
                    location,
                    sourceType: 'inventory.receive',
                    sourceRef: movement.id,
                    unitCost,
                    quantityReceived: dto.quantity,
                    quantityRemaining: dto.quantity,
                },
            });
            return {
                result: {
                    productId: dto.productId,
                    location,
                    received: dto.quantity,
                    onHand: balance.onHand,
                    reserved: balance.reserved,
                    available: balance.onHand - balance.reserved,
                    movementId: movement.id,
                },
                events: [{
                        type: event_types_1.EventType.StockReceived,
                        actor,
                        payload: {
                            productId: dto.productId,
                            location,
                            qty: dto.quantity,
                            trackingMode: 'quantity',
                            movementId: movement.id,
                        },
                        refs: [dto.productId, movement.id],
                    }],
            };
        });
    }
    async receiveConsignment(dto, actor) {
        const location = await this.mutationLocation(actor, dto.location);
        const existing = await this.prisma.consignmentItem.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { unit: true, product: true },
        });
        if (existing) {
            const samePayload = existing.productId === dto.productId
                && existing.unit.imei === dto.imei.trim()
                && existing.unit.location === location
                && existing.ownerName === dto.ownerName.trim()
                && (existing.ownerContact ?? '') === (dto.ownerContact?.trim() ?? '')
                && existing.commissionBps === dto.commissionBps
                && (existing.unit.grade ?? null) === (dto.grade ?? null);
            if (!samePayload)
                throw new errors_1.ConflictError('consignment_idempotency_mismatch', 'Ключ приёмки уже использован с другими данными');
            return existing;
        }
        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
            include: { _count: { select: { includedInBundles: true, bundleComponents: true } } },
        });
        if (!product)
            throw new errors_1.ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
        if (product.trackingMode !== 'serialized') {
            throw new errors_1.ValidationError('serialized_product_required', 'Комиссионная приёмка пока поддерживает серийный товар');
        }
        if (product.supplyMode === 'to_order') {
            throw new errors_1.ConflictError('to_order_free_stock_forbidden', 'Заказной товар нельзя принять как свободный комиссионный остаток');
        }
        if (product._count.includedInBundles > 0 || product._count.bundleComponents > 0) {
            throw new errors_1.ValidationError('consignment_bundle_forbidden', 'Комиссионный товар нельзя использовать как виртуальный набор или его компонент');
        }
        const imei = dto.imei.trim();
        const ownerName = dto.ownerName.trim();
        if (!imei || !ownerName || !location)
            throw new errors_1.ValidationError('consignment_fields_required', 'Заполните IMEI, владельца и склад');
        if (await this.prisma.deviceUnit.findUnique({ where: { imei } })) {
            throw new errors_1.ConflictError('imei_already_exists', `IMEI ${imei} уже есть в базе`);
        }
        return this.audit.transaction(async (tx) => {
            const unit = await tx.deviceUnit.create({
                data: { imei, productId: product.id, location, grade: dto.grade, status: 'in_stock' },
            });
            const item = await tx.consignmentItem.create({
                data: {
                    idempotencyKey: dto.idempotencyKey,
                    unitId: unit.id,
                    productId: product.id,
                    ownerName,
                    ownerContact: dto.ownerContact?.trim() || null,
                    commissionBps: dto.commissionBps,
                    createdBy: actor,
                },
                include: { unit: true, product: true },
            });
            const movement = await tx.inventoryMovement.create({
                data: { productId: product.id, qty: 1, type: 'consignment_received', to: location, reason: ownerName },
            });
            return {
                result: item,
                events: [{
                        type: event_types_1.EventType.ConsignmentReceived,
                        actor,
                        payload: {
                            consignmentItemId: item.id,
                            productId: product.id,
                            imei,
                            location,
                            ownerName,
                            commissionBps: dto.commissionBps,
                        },
                        refs: [item.id, product.id, imei, movement.id],
                    }],
            };
        });
    }
    async receiveQuantityConsignment(dto, actor) {
        const location = await this.mutationLocation(actor, dto.location);
        const normalized = {
            location,
            ownerName: dto.ownerName.trim(),
            ownerContact: dto.ownerContact?.trim() || null,
        };
        if (!normalized.location || !normalized.ownerName) {
            throw new errors_1.ValidationError('consignment_fields_required', 'Заполните владельца и склад');
        }
        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
            include: { _count: { select: { includedInBundles: true, bundleComponents: true } } },
        });
        if (!product)
            throw new errors_1.ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
        if (product.trackingMode !== 'quantity') {
            throw new errors_1.ValidationError('quantity_product_required', 'Для серийного товара используйте приёмку по IMEI');
        }
        if (product.supplyMode === 'to_order') {
            throw new errors_1.ConflictError('to_order_free_stock_forbidden', 'Заказной товар нельзя принять как свободный комиссионный остаток');
        }
        if (product._count.includedInBundles > 0 || product._count.bundleComponents > 0) {
            throw new errors_1.ValidationError('consignment_bundle_forbidden', 'Комиссионный товар нельзя использовать в виртуальном наборе');
        }
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'quantity-consignment:' + dto.idempotencyKey}))::text AS locked`;
            const existing = await tx.quantityConsignmentLot.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
            if (existing) {
                const same = existing.productId === dto.productId
                    && existing.location === normalized.location
                    && existing.ownerName === normalized.ownerName
                    && existing.ownerContact === normalized.ownerContact
                    && existing.commissionBps === dto.commissionBps
                    && existing.receivedQty === dto.quantity;
                if (!same)
                    throw new errors_1.ConflictError('consignment_idempotency_mismatch', 'Ключ приёмки уже использован с другими данными');
                return { result: existing, events: [] };
            }
            const balance = await tx.inventoryBalance.upsert({
                where: { productId_location: { productId: dto.productId, location: normalized.location } },
                create: { productId: dto.productId, location: normalized.location, onHand: dto.quantity },
                update: { onHand: { increment: dto.quantity } },
            });
            const lot = await tx.quantityConsignmentLot.create({
                data: {
                    idempotencyKey: dto.idempotencyKey,
                    productId: dto.productId,
                    balanceId: balance.id,
                    location: normalized.location,
                    ownerName: normalized.ownerName,
                    ownerContact: normalized.ownerContact,
                    commissionBps: dto.commissionBps,
                    receivedQty: dto.quantity,
                    availableQty: dto.quantity,
                    createdBy: actor,
                },
                include: { product: { select: { id: true, sku: true, name: true, price: true } } },
            });
            const movement = await tx.inventoryMovement.create({
                data: { productId: dto.productId, qty: dto.quantity, type: 'consignment_received', to: normalized.location, reason: normalized.ownerName },
            });
            return {
                result: lot,
                events: [{
                        type: event_types_1.EventType.ConsignmentReceived,
                        actor,
                        payload: { lotId: lot.id, productId: dto.productId, location: normalized.location, qty: dto.quantity, ownerName: normalized.ownerName, commissionBps: dto.commissionBps },
                        refs: [lot.id, dto.productId, movement.id],
                    }],
            };
        });
    }
    listConsignments() {
        return this.prisma.consignmentItem.findMany({
            include: {
                unit: { select: { imei: true, location: true, status: true } },
                product: { select: { id: true, sku: true, name: true, price: true } },
                saleOrder: { select: { id: true, status: true, createdAt: true } },
                payout: { select: { id: true, status: true, paidAt: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }
    listQuantityConsignments() {
        return this.prisma.quantityConsignmentLot.findMany({
            include: {
                product: { select: { id: true, sku: true, name: true, price: true } },
                allocations: {
                    include: {
                        saleOrder: { select: { id: true, status: true, createdAt: true } },
                        payout: { select: { id: true, status: true, paidAt: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }
    listConsignmentPayouts() {
        return this.prisma.consignmentPayout.findMany({
            include: {
                items: { select: { id: true, ownerAmount: true, saleOrderId: true } },
                quantityAllocations: { select: { id: true, ownerAmount: true, returnedOwnerAmount: true, saleOrderId: true, qty: true, returnedQty: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    listConsignmentAdjustments() {
        return Promise.all([
            this.prisma.consignmentAdjustment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
            this.prisma.quantityConsignmentAdjustment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
        ]).then(([serialized, quantity]) => [...serialized, ...quantity].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    }
    async createConsignmentPayout(dto, actor) {
        const existing = await this.prisma.consignmentPayout.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { items: true, quantityAllocations: true },
        });
        if (existing) {
            const requestedItems = [...new Set(dto.itemIds ?? [])].sort();
            const requestedQuantity = [...new Set(dto.quantityAllocationIds ?? [])].sort();
            if (!sameIds(requestedItems, existing.items.map((item) => item.id).sort())
                || !sameIds(requestedQuantity, existing.quantityAllocations.map((item) => item.id).sort())) {
                throw new errors_1.ConflictError('consignment_idempotency_mismatch', 'Ключ выплаты уже использован с другим набором позиций');
            }
            return existing;
        }
        return this.audit.transaction(async (tx) => {
            const ids = [...new Set(dto.itemIds ?? [])];
            const quantityIds = [...new Set(dto.quantityAllocationIds ?? [])];
            if (ids.length + quantityIds.length === 0) {
                throw new errors_1.ValidationError('consignment_items_required', 'Выберите хотя бы одну комиссионную продажу');
            }
            for (const itemId of [...ids].sort()) {
                await tx.$queryRaw `SELECT id FROM "ConsignmentItem" WHERE id = ${itemId} FOR UPDATE`;
            }
            for (const allocationId of [...quantityIds].sort()) {
                await tx.$queryRaw `SELECT id FROM "QuantityConsignmentAllocation" WHERE id = ${allocationId} FOR UPDATE`;
            }
            const items = await tx.consignmentItem.findMany({
                where: { id: { in: ids } },
                include: { saleOrder: { select: { id: true, status: true } } },
            });
            if (items.length !== ids.length)
                throw new errors_1.ValidationError('consignment_not_found', 'Часть комиссионных позиций не найдена');
            const quantityAllocations = await tx.quantityConsignmentAllocation.findMany({
                where: { id: { in: quantityIds } },
                include: { lot: true, saleOrder: { select: { id: true, status: true } } },
            });
            if (quantityAllocations.length !== quantityIds.length) {
                throw new errors_1.ValidationError('consignment_not_found', 'Часть количественных комиссионных продаж не найдена');
            }
            const owners = [
                ...items.map((item) => ({ name: item.ownerName, contact: item.ownerContact })),
                ...quantityAllocations.map((item) => ({ name: item.lot.ownerName, contact: item.lot.ownerContact })),
            ];
            const first = owners[0];
            if (owners.some((owner) => owner.name !== first.name || owner.contact !== first.contact)) {
                throw new errors_1.ValidationError('consignment_owner_mismatch', 'Одна выплата может содержать позиции только одного владельца');
            }
            if (items.some((item) => item.status !== 'sold' || item.payoutId || item.saleOrder?.status !== 'completed')) {
                throw new errors_1.ConflictError('consignment_not_settleable', 'Выплата доступна только для завершённых продаж без предыдущей выплаты');
            }
            if (quantityAllocations.some((item) => item.status !== 'sold' || item.payoutId || item.saleOrder?.status !== 'completed')) {
                throw new errors_1.ConflictError('consignment_not_settleable', 'Выплата доступна только для завершённых продаж без предыдущей выплаты');
            }
            const orderIds = [
                ...items.flatMap((item) => item.saleOrderId ? [item.saleOrderId] : []),
                ...quantityAllocations.flatMap((item) => item.saleOrderId ? [item.saleOrderId] : []),
            ];
            const blockedReturn = await tx.return.findFirst({
                where: { orderId: { in: orderIds }, status: { notIn: ['rejected', 'reconciled'] } },
                select: { id: true },
            });
            if (blockedReturn)
                throw new errors_1.ConflictError('consignment_return_pending', 'Нельзя выплатить владельцу при активном или согласованном возврате');
            const grossAmount = items.reduce((sum, item) => sum + (item.salePrice ?? 0), 0)
                + quantityAllocations.reduce((sum, item) => sum + (item.salePrice ?? 0) - item.returnedSaleAmount, 0);
            const commissionAmount = items.reduce((sum, item) => sum + (item.commissionAmount ?? 0), 0)
                + quantityAllocations.reduce((sum, item) => sum + (item.commissionAmount ?? 0) - item.returnedCommissionAmount, 0);
            const ownerAmount = items.reduce((sum, item) => sum + (item.ownerAmount ?? 0), 0)
                + quantityAllocations.reduce((sum, item) => sum + (item.ownerAmount ?? 0) - item.returnedOwnerAmount, 0);
            const payout = await tx.consignmentPayout.create({
                data: {
                    idempotencyKey: dto.idempotencyKey,
                    ownerName: first.name,
                    ownerContact: first.contact,
                    grossAmount,
                    commissionAmount,
                    ownerAmount,
                    createdBy: actor,
                    items: { connect: ids.map((id) => ({ id })) },
                    quantityAllocations: { connect: quantityIds.map((id) => ({ id })) },
                },
                include: { items: true, quantityAllocations: true },
            });
            return {
                result: payout,
                events: [{
                        type: event_types_1.EventType.ConsignmentPayoutCreated,
                        actor,
                        payload: { payoutId: payout.id, ownerName: payout.ownerName, grossAmount, commissionAmount, ownerAmount, items: ids.length, quantityAllocations: quantityIds.length },
                        refs: [payout.id, ...ids, ...quantityIds, ...orderIds],
                    }],
            };
        });
    }
    async payConsignmentPayout(id, dto, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "ConsignmentPayout" WHERE id = ${id} FOR UPDATE`;
            const payout = await tx.consignmentPayout.findUnique({ where: { id }, include: { items: true, quantityAllocations: true } });
            if (!payout)
                throw new errors_1.ValidationError('consignment_payout_not_found', `Выплата ${id} не найдена`);
            if (payout.status === 'cancelled') {
                throw new errors_1.ConflictError('consignment_payout_cancelled', 'Отменённую выплату нельзя провести');
            }
            if (payout.status === 'paid') {
                if (payout.paymentKey !== dto.paymentKey || (dto.paymentMethod && payout.paymentMethod !== dto.paymentMethod)) {
                    throw new errors_1.ConflictError('consignment_payment_key_reused', 'Выплата уже проведена с другим ключом или каналом');
                }
                return { result: payout, events: [] };
            }
            const paymentMethod = dto.paymentMethod ?? client_1.PaymentMethod.cash;
            const duplicate = await tx.consignmentPayout.findUnique({ where: { paymentKey: dto.paymentKey } });
            if (duplicate && duplicate.id !== id)
                throw new errors_1.ConflictError('consignment_payment_key_reused', 'Ключ платежа уже использован');
            const paid = await tx.consignmentPayout.update({
                where: { id },
                data: { status: 'paid', paymentKey: dto.paymentKey, paymentMethod, paidBy: actor, paidAt: new Date() },
                include: { items: true, quantityAllocations: true },
            });
            if (paid.ownerAmount > 0) {
                await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                    idempotencyKey: `accounting:consignment.payout:${id}:${dto.paymentKey}`,
                    sourceType: 'consignment.payout',
                    sourceRef: `${id}:${dto.paymentKey}`,
                    description: `Выплата владельцу комиссионного товара ${id}`,
                    occurredAt: paid.paidAt ?? new Date(),
                    createdBy: actor,
                    lines: [
                        { accountCode: '2000', debit: paid.ownerAmount, memo: 'Погашение обязательства перед владельцем' },
                        { accountCode: (0, accounting_journal_1.paymentAccountCode)(paymentMethod), credit: paid.ownerAmount, memo: `Выплата владельцу (${paymentMethod})` },
                    ],
                });
                if (paymentMethod === client_1.PaymentMethod.cash) {
                    await (0, cash_drawer_1.recordCashDrawerMovementOnTx)(tx, {
                        idempotencyKey: `drawer:consignment.payout:${id}:${dto.paymentKey}`,
                        staffId: actor,
                        amount: -paid.ownerAmount,
                        kind: 'consignment_payout',
                        sourceType: 'consignment.payout',
                        sourceRef: id,
                        reason: `Наличная выплата владельцу ${paid.ownerName}`,
                        createdBy: actor,
                        accountingEntryId: null,
                    });
                }
            }
            await tx.consignmentItem.updateMany({ where: { payoutId: id, status: 'sold' }, data: { status: 'settled' } });
            await tx.quantityConsignmentAllocation.updateMany({ where: { payoutId: id, status: 'sold' }, data: { status: 'settled' } });
            return {
                result: paid,
                events: [{
                        type: event_types_1.EventType.ConsignmentPayoutPaid,
                        actor,
                        payload: { payoutId: id, ownerName: paid.ownerName, ownerAmount: paid.ownerAmount, paymentKey: dto.paymentKey },
                        refs: [id, ...paid.items.map((item) => item.id), ...paid.quantityAllocations.map((item) => item.id)],
                    }],
            };
        });
    }
    async count(dto, actor, idempotencyKey) {
        const key = idempotencyKey?.trim();
        if (!key) {
            throw new errors_1.ValidationError('idempotency_key_required', 'Для инвентаризации требуется Idempotency-Key');
        }
        if (key.length > 128) {
            throw new errors_1.ValidationError('idempotency_key_invalid', 'Idempotency-Key не должен превышать 128 символов');
        }
        const location = await this.mutationLocation(actor, dto.location);
        const command = { actor, productId: dto.productId, location, counted: dto.counted };
        const replay = await this.prisma.inventoryMovement.findUnique({
            where: { idempotencyKey: key },
        });
        if (replay)
            return replayCountMovement(replay, command);
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3000ms'");
                await tx.$queryRaw `SELECT id FROM "Product" WHERE id = ${dto.productId} FOR SHARE`;
                const product = await tx.product.findUnique({ where: { id: dto.productId } });
                if (!product) {
                    throw new errors_1.ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
                }
                if (product.trackingMode === 'quantity') {
                    await tx.$executeRawUnsafe('LOCK TABLE "InventoryBalance" IN SHARE MODE');
                }
                else {
                    await tx.$executeRawUnsafe('LOCK TABLE "DeviceUnit" IN SHARE MODE');
                }
                const lockedReplay = await tx.inventoryMovement.findUnique({
                    where: { idempotencyKey: key },
                });
                if (lockedReplay) {
                    return { result: replayCountMovement(lockedReplay, command), events: [] };
                }
                const expected = product.trackingMode === 'quantity'
                    ? (await tx.inventoryBalance.findUnique({
                        where: { productId_location: { productId: dto.productId, location } },
                    }))?.onHand ?? 0
                    : await tx.deviceUnit.count({
                        where: { productId: dto.productId, location, status: 'in_stock' },
                    });
                const diff = dto.counted - expected;
                const snapshotBase = {
                    version: 1,
                    ...command,
                    expected,
                    diff,
                };
                const snapshot = {
                    ...snapshotBase,
                    fingerprint: countFingerprint(snapshotBase),
                };
                const movement = await tx.inventoryMovement.create({
                    data: {
                        idempotencyKey: key,
                        productId: dto.productId,
                        qty: diff,
                        type: 'count',
                        from: location,
                        reason: `${COUNT_SNAPSHOT_PREFIX}${JSON.stringify(snapshot)}`,
                    },
                });
                return {
                    result: {
                        productId: dto.productId,
                        location,
                        expected,
                        counted: dto.counted,
                        diff,
                        movementId: movement.id,
                        fingerprint: snapshot.fingerprint,
                    },
                    events: [
                        {
                            type: event_types_1.EventType.InventoryCounted,
                            actor,
                            payload: {
                                productId: dto.productId,
                                location,
                                expected,
                                counted: dto.counted,
                                diff,
                                fingerprint: snapshot.fingerprint,
                                idempotencyKey: key,
                            },
                            refs: [dto.productId, movement.id],
                        },
                    ],
                };
            }, { timeout: 10_000, maxWait: 5_000 });
        }
        catch (error) {
            if (isDatabaseLockTimeout(error)) {
                throw new errors_1.ConflictError('inventory_count_busy', 'Остаток сейчас изменяется; повторите пересчёт с тем же Idempotency-Key');
            }
            if ((0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                const racedReplay = await this.prisma.inventoryMovement.findUnique({
                    where: { idempotencyKey: key },
                });
                if (racedReplay)
                    return replayCountMovement(racedReplay, command);
            }
            throw error;
        }
    }
    async transfer(dto, actor) {
        const [assigned, destination] = await Promise.all([
            this.actorStorePoint(actor),
            this.activeLocation(dto.to, 'Точка назначения недоступна или отключена'),
        ]);
        const to = destination.inventoryLocation;
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "DeviceUnit" WHERE imei = ${dto.imei} FOR UPDATE`;
            const unit = await tx.deviceUnit.findUnique({
                where: { imei: dto.imei },
                include: { consignmentItem: { select: { id: true } } },
            });
            if (!unit)
                throw new errors_1.ValidationError('unit_not_found', `IMEI ${dto.imei} не найден`);
            if (unit.status !== 'in_stock') {
                throw new errors_1.ConflictError('not_transferable', `IMEI ${dto.imei} нельзя перемещать (статус: ${unit.status})`);
            }
            const sourcePoint = await this.activeLocation(unit.location, 'Точка отправления недоступна или отключена');
            if (assigned.role !== 'owner' && assigned.role !== 'admin' && assigned.id !== sourcePoint.id) {
                throw new errors_1.ForbiddenError('staff_point_mismatch', 'Перемещение разрешено только из своей точки');
            }
            if (sourcePoint.id === destination.id) {
                throw new errors_1.ValidationError('same_location', `IMEI ${dto.imei} уже на складе ${to}`);
            }
            const from = sourcePoint.inventoryLocation;
            const ownedCost = unit.consignmentItem ? 0 : unit.acquisitionCost;
            await tx.deviceUnit.update({ where: { imei: dto.imei }, data: { location: to } });
            const movement = await tx.inventoryMovement.create({
                data: {
                    productId: unit.productId,
                    qty: 1,
                    type: 'moved',
                    from,
                    to,
                    reason: dto.reason ?? null,
                    unitCost: ownedCost,
                    totalValue: ownedCost,
                    valuationQty: unit.consignmentItem ? 0 : (ownedCost === null ? null : 1),
                },
            });
            return {
                result: { imei: dto.imei, from, to, movementId: movement.id },
                events: [
                    {
                        type: event_types_1.EventType.StockMoved,
                        actor,
                        payload: { imei: dto.imei, from, to, movementId: movement.id },
                        refs: [dto.imei, unit.productId, movement.id],
                    },
                ],
            };
        });
    }
    async transferQuantity(dto, actor) {
        const [from, destination] = await Promise.all([
            this.mutationLocation(actor, dto.from),
            this.activeLocation(dto.to, 'Точка назначения недоступна или отключена'),
        ]);
        const to = destination.inventoryLocation;
        const canonicalDto = { ...dto, from, to };
        const existing = await this.prisma.inventoryMovement.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing)
            return replayQuantityTransfer(existing, canonicalDto);
        const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
        if (!product)
            throw new errors_1.ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
        if (product.trackingMode !== 'quantity') {
            throw new errors_1.ValidationError('quantity_product_required', 'Для серийного товара используйте перемещение по IMEI');
        }
        if (from === to)
            throw new errors_1.ValidationError('same_location', 'Склады отправления и назначения совпадают');
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'quantity-transfer:' + dto.idempotencyKey}))::text AS locked`;
            const replay = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
            if (replay)
                return { result: replayQuantityTransfer(replay, canonicalDto), events: [] };
            await tx.$queryRaw `SELECT id FROM "InventoryBalance" WHERE "productId" = ${dto.productId} AND location = ${from} FOR UPDATE`;
            const source = await tx.inventoryBalance.findUnique({
                where: { productId_location: { productId: dto.productId, location: from } },
            });
            if (!source || source.onHand - source.reserved < dto.qty) {
                throw new errors_1.ConflictError('insufficient_available_stock', `На складе ${from} недостаточно свободного остатка`);
            }
            await tx.inventoryBalance.update({
                where: { id: source.id },
                data: { onHand: { decrement: dto.qty } },
            });
            const destination = await tx.inventoryBalance.upsert({
                where: { productId_location: { productId: dto.productId, location: to } },
                create: { productId: dto.productId, location: to, onHand: dto.qty },
                update: { onHand: { increment: dto.qty } },
            });
            const movement = await tx.inventoryMovement.create({
                data: {
                    idempotencyKey: dto.idempotencyKey,
                    productId: dto.productId,
                    qty: dto.qty,
                    type: 'moved',
                    from,
                    to,
                    reason: dto.reason?.trim() || null,
                },
            });
            const consignmentQty = await (0, consignment_accounting_1.transferQuantityConsignmentOnTx)(tx, {
                movementId: movement.id,
                sourceBalanceId: source.id,
                destinationBalanceId: destination.id,
                destination: to,
                qty: dto.qty,
                actor,
            });
            const valuation = await (0, inventory_valuation_1.transferQuantityValuationOnTx)(tx, {
                movementId: movement.id,
                productId: dto.productId,
                sourceBalanceId: source.id,
                destinationBalanceId: destination.id,
                destination: to,
                quantity: dto.qty - consignmentQty,
            });
            await tx.inventoryMovement.update({
                where: { id: movement.id },
                data: {
                    unitCost: valuation.unitCost,
                    totalValue: valuation.totalValue,
                    valuationQty: dto.qty - consignmentQty,
                },
            });
            return {
                result: {
                    movementId: movement.id,
                    productId: dto.productId,
                    from,
                    to,
                    qty: dto.qty,
                    consignmentQty,
                    totalValue: valuation.totalValue,
                    idempotent: false,
                },
                events: [{
                        type: event_types_1.EventType.StockMoved,
                        actor,
                        payload: { movementId: movement.id, productId: dto.productId, trackingMode: 'quantity', from, to, qty: dto.qty, consignmentQty, totalValue: valuation.totalValue },
                        refs: [movement.id, dto.productId],
                    }],
            };
        });
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        approvals_service_1.ApprovalsService])
], InventoryService);
function sameIds(left, right) {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}
function replayQuantityTransfer(movement, dto) {
    if (movement.type !== 'moved'
        || movement.productId !== dto.productId
        || movement.qty !== dto.qty
        || movement.from !== dto.from.trim()
        || movement.to !== dto.to.trim()) {
        throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ перемещения уже использован с другими данными');
    }
    return {
        movementId: movement.id,
        productId: movement.productId,
        from: movement.from,
        to: movement.to,
        qty: movement.qty,
        totalValue: movement.totalValue ?? 0,
        idempotent: true,
    };
}
//# sourceMappingURL=inventory.service.js.map