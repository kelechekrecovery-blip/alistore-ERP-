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
exports.LogisticsService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const business_time_1 = require("../common/business-time");
const store_point_identity_1 = require("../common/store-point-identity");
const ACTIVE_SLOT_STATUSES = ['created', 'awaiting_confirmation', 'confirmed', 'reserved', 'awaiting_payment', 'paid', 'picking', 'packed', 'courier_assigned', 'out_for_delivery'];
const STORE_POINT_OPEN_ORDER_STATUSES = ['created', 'awaiting_confirmation', 'confirmed', 'reserved', 'awaiting_payment', 'paid', 'picking', 'packed', 'ready_for_pickup', 'courier_assigned', 'out_for_delivery', 'delivered'];
function key(raw) {
    const value = raw?.trim();
    if (!value || value.length > 128)
        throw new errors_1.ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
    return value;
}
function dayBounds(date) {
    const businessDate = date?.slice(0, 10) ?? new Intl.DateTimeFormat('en-CA', {
        timeZone: business_time_1.BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    const start = new Date(`${businessDate}T00:00:00.000${business_time_1.BUSINESS_UTC_OFFSET}`);
    if (Number.isNaN(start.getTime()))
        throw new errors_1.ValidationError('invalid_logistics_date', 'Неверная дата');
    return { start, end: new Date(start.getTime() + 86_400_000) };
}
let LogisticsService = class LogisticsService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async availability(date, zoneId) {
        const { start, end } = dayBounds(date);
        const zones = await this.prisma.deliveryZone.findMany({
            where: { active: true, ...(zoneId ? { id: zoneId } : {}) },
            include: { slots: { where: { active: true, startsAt: { gte: start, lt: end } }, orderBy: { startsAt: 'asc' } } },
            orderBy: { fee: 'asc' },
        });
        const slotIds = zones.flatMap((zone) => zone.slots.map((slot) => slot.id));
        const counts = slotIds.length ? await this.prisma.order.groupBy({
            by: ['deliverySlotId'], where: { deliverySlotId: { in: slotIds }, isDemo: false, status: { in: [...ACTIVE_SLOT_STATUSES] } }, _count: { _all: true },
        }) : [];
        const booked = new Map(counts.map((row) => [row.deliverySlotId, row._count._all]));
        return zones.map((zone) => ({ ...zone, slots: zone.slots.map((slot) => {
                const reserved = booked.get(slot.id) ?? 0;
                return { ...slot, reserved, remaining: Math.max(0, slot.capacity - reserved), available: reserved < slot.capacity };
            }) }));
    }
    async checkoutOptions(date) {
        const [pickupPoints, deliveryZones] = await Promise.all([
            this.prisma.storePoint.findMany({
                where: { active: true },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    address: true,
                    inventoryLocation: true,
                    hours: true,
                    pickupInstructions: true,
                    sortOrder: true,
                },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            }),
            this.availability(date),
        ]);
        return { pickupPoints, deliveryZones };
    }
    async resolveStorePoint(storePointId, legacyAlias, requireSelection = false) {
        const reference = storePointId ?? legacyAlias;
        if (!reference && !requireSelection) {
            throw new errors_1.ValidationError('store_point_required', 'Выберите точку выполнения заказа');
        }
        return (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, reference);
    }
    async overview(date) {
        const [zones, couriers, pendingOrders, runs, storePoints, pickupOrders] = await Promise.all([
            this.availability(date),
            this.prisma.staffUser.findMany({ where: { active: true, role: 'courier' }, select: { id: true, username: true, role: true }, orderBy: { username: 'asc' } }),
            this.prisma.order.findMany({
                where: { isDemo: false, fulfillmentType: 'courier', courierId: null, status: { in: ['paid', 'packed'] } },
                include: { customer: { select: { name: true, phone: true } }, items: true, deliveryZone: true, logisticsSlot: true, payments: { select: { amount: true, status: true } } },
                orderBy: [{ deliverySlot: 'asc' }, { createdAt: 'asc' }],
            }),
            this.prisma.courierRun.findMany({ include: { orders: { include: { customer: { select: { name: true, phone: true } }, logisticsSlot: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
            this.prisma.storePoint.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
            this.prisma.order.findMany({
                where: { storePointId: { not: null }, status: { in: ['paid', 'picking', 'packed', 'ready_for_pickup'] } },
                select: { storePointId: true, status: true },
            }),
        ]);
        const pickupPoints = storePoints.map((point) => ({
            ...point,
            type: 'магазин',
            waiting: pickupOrders.filter((order) => order.storePointId === point.id && order.status === 'ready_for_pickup').length,
            status: point.active ? 'работает' : 'отключена',
        }));
        return { zones, couriers, pendingOrders, runs, pickupPoints };
    }
    createStorePoint(dto, actor, rawKey) {
        const idempotencyKey = key(rawKey);
        const code = dto.code.trim().toLowerCase();
        const inventoryLocation = dto.inventoryLocation.trim().toUpperCase();
        return this.audit.transaction(async (tx) => {
            const replay = await tx.storePoint.findUnique({ where: { idempotencyKey } });
            if (replay) {
                if (replay.code !== code || replay.inventoryLocation !== inventoryLocation) {
                    throw new errors_1.ConflictError('store_point_idempotency_mismatch', 'Ключ уже использован для другой точки');
                }
                return { result: replay, events: [] };
            }
            const point = await tx.storePoint.create({
                data: {
                    code,
                    name: dto.name.trim(),
                    address: dto.address.trim(),
                    inventoryLocation,
                    hours: dto.hours.trim(),
                    pickupInstructions: dto.pickupInstructions?.trim() || null,
                    active: dto.active ?? true,
                    sortOrder: dto.sortOrder ?? 100,
                    createdBy: actor,
                    idempotencyKey,
                },
            });
            return {
                result: point,
                events: [{
                        type: event_types_1.EventType.StorePointCreated,
                        actor,
                        payload: { storePointId: point.id, code, inventoryLocation, active: point.active },
                        refs: [point.id, inventoryLocation],
                    }],
            };
        });
    }
    updateStorePoint(id, dto, actor, rawKey) {
        const idempotencyKey = key(rawKey);
        const normalized = {
            name: dto.name?.trim(),
            address: dto.address?.trim(),
            hours: dto.hours?.trim(),
            pickupInstructions: dto.pickupInstructions?.trim(),
            active: dto.active,
            sortOrder: dto.sortOrder,
        };
        const fingerprint = JSON.stringify(normalized);
        return this.audit.transaction(async (tx) => {
            const replay = await tx.storePointCommand.findUnique({ where: { idempotencyKey } });
            if (replay) {
                if (replay.storePointId !== id || replay.fingerprint !== fingerprint) {
                    throw new errors_1.ConflictError('store_point_idempotency_mismatch', 'Ключ уже использован для другого изменения');
                }
                return { result: replay.response, events: [] };
            }
            await tx.$queryRaw `SELECT id FROM "StorePoint" WHERE id = ${id} FOR UPDATE`;
            const current = await tx.storePoint.findUnique({ where: { id } });
            if (!current)
                throw new errors_1.ValidationError('store_point_not_found', 'Точка не найдена');
            if (current.active && normalized.active === false) {
                const [openShift, openOrders, serializedStock, quantityStock, otherActivePoints] = await Promise.all([
                    tx.cashShift.findFirst({
                        where: { point: current.inventoryLocation, closedAt: null },
                        select: { id: true },
                    }),
                    tx.order.findMany({
                        where: { storePointId: id, isDemo: false, status: { in: [...STORE_POINT_OPEN_ORDER_STATUSES] } },
                        select: { id: true, status: true },
                        take: 10,
                    }),
                    tx.deviceUnit.findMany({
                        where: { location: current.inventoryLocation, status: { in: ['in_stock', 'reserved'] } },
                        select: { id: true, status: true },
                        take: 10,
                    }),
                    tx.inventoryBalance.findMany({
                        where: {
                            location: current.inventoryLocation,
                            OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }],
                        },
                        select: { id: true, onHand: true, reserved: true },
                        take: 10,
                    }),
                    tx.storePoint.count({ where: { active: true, id: { not: id } } }),
                ]);
                const blockers = [];
                if (openShift)
                    blockers.push(`открытая кассовая смена ${openShift.id}`);
                if (openOrders.length > 0)
                    blockers.push(`активные заказы: ${openOrders.map((order) => `${order.id} (${order.status})`).join(', ')}`);
                if (serializedStock.length > 0)
                    blockers.push(`серийный остаток: ${serializedStock.length}${serializedStock.length === 10 ? '+' : ''} единиц`);
                if (quantityStock.length > 0)
                    blockers.push(`количественный остаток: ${quantityStock.length}${quantityStock.length === 10 ? '+' : ''} позиций`);
                if (otherActivePoints === 0)
                    blockers.push('это последняя активная точка — отключение сломает checkout и POS');
                if (blockers.length > 0) {
                    throw new errors_1.ConflictError('store_point_deactivation_blocked', `Деактивация точки заблокирована: ${blockers.join('; ')}`);
                }
            }
            const point = await tx.storePoint.update({
                where: { id },
                data: {
                    ...(normalized.name !== undefined ? { name: normalized.name } : {}),
                    ...(normalized.address !== undefined ? { address: normalized.address } : {}),
                    ...(normalized.hours !== undefined ? { hours: normalized.hours } : {}),
                    ...(normalized.pickupInstructions !== undefined ? { pickupInstructions: normalized.pickupInstructions || null } : {}),
                    ...(normalized.active !== undefined ? { active: normalized.active } : {}),
                    ...(normalized.sortOrder !== undefined ? { sortOrder: normalized.sortOrder } : {}),
                },
            });
            const response = JSON.parse(JSON.stringify(point));
            await tx.storePointCommand.create({ data: { idempotencyKey, storePointId: id, fingerprint, response } });
            return {
                result: response,
                events: [{
                        type: event_types_1.EventType.StorePointUpdated,
                        actor,
                        payload: { storePointId: id, before: current, after: point },
                        refs: [id, point.inventoryLocation],
                    }],
            };
        });
    }
    createZone(dto, actor, rawKey) {
        const idempotencyKey = key(rawKey);
        if (dto.etaMaxMinutes < dto.etaMinMinutes)
            throw new errors_1.ValidationError('invalid_zone_eta', 'Максимальное ETA меньше минимального');
        const code = dto.code.trim().toLowerCase();
        return this.audit.transaction(async (tx) => {
            const replay = await tx.deliveryZone.findUnique({ where: { idempotencyKey } });
            if (replay) {
                if (replay.code !== code || replay.fee !== dto.fee)
                    throw new errors_1.ConflictError('logistics_idempotency_mismatch', 'Ключ уже использован для другой зоны');
                return { result: replay, events: [] };
            }
            const zone = await tx.deliveryZone.create({ data: { code, name: dto.name.trim(), fee: dto.fee, etaMinMinutes: dto.etaMinMinutes, etaMaxMinutes: dto.etaMaxMinutes, active: dto.active ?? true, createdBy: actor, idempotencyKey } });
            return { result: zone, events: [{ type: event_types_1.EventType.DeliveryZoneCreated, actor, payload: { zoneId: zone.id, code, fee: zone.fee }, refs: [zone.id] }] };
        });
    }
    createSlot(dto, actor, rawKey) {
        const idempotencyKey = key(rawKey);
        const startsAt = new Date(dto.startsAt);
        const endsAt = new Date(dto.endsAt);
        if (endsAt <= startsAt)
            throw new errors_1.ValidationError('invalid_slot_window', 'Конец слота должен быть позже начала');
        return this.audit.transaction(async (tx) => {
            const replay = await tx.deliverySlot.findUnique({ where: { idempotencyKey } });
            if (replay) {
                if (replay.zoneId !== dto.zoneId || replay.startsAt.getTime() !== startsAt.getTime() || replay.capacity !== dto.capacity)
                    throw new errors_1.ConflictError('logistics_idempotency_mismatch', 'Ключ уже использован для другого слота');
                return { result: replay, events: [] };
            }
            const zone = await tx.deliveryZone.findUnique({ where: { id: dto.zoneId } });
            if (!zone?.active)
                throw new errors_1.ValidationError('delivery_zone_unavailable', 'Зона не найдена или отключена');
            const slot = await tx.deliverySlot.create({ data: { zoneId: dto.zoneId, startsAt, endsAt, capacity: dto.capacity, createdBy: actor, idempotencyKey } });
            return { result: slot, events: [{ type: event_types_1.EventType.DeliverySlotCreated, actor, payload: { slotId: slot.id, zoneId: slot.zoneId, startsAt, endsAt, capacity: slot.capacity }, refs: [slot.id, slot.zoneId] }] };
        });
    }
};
exports.LogisticsService = LogisticsService;
exports.LogisticsService = LogisticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], LogisticsService);
//# sourceMappingURL=logistics.service.js.map