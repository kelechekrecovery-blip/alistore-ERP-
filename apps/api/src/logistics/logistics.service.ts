import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliverySlotDto, CreateDeliveryZoneDto, CreateStorePointDto, UpdateStorePointDto } from './logistics.dto';

const ACTIVE_SLOT_STATUSES = ['created', 'awaiting_confirmation', 'confirmed', 'reserved', 'awaiting_payment', 'paid', 'picking', 'packed', 'courier_assigned', 'out_for_delivery'] as const;

function key(raw?: string) {
  const value = raw?.trim();
  if (!value || value.length > 128) throw new ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
  return value;
}

function dayBounds(date?: string) {
  const start = date ? new Date(`${date.slice(0, 10)}T00:00:00.000Z`) : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  if (Number.isNaN(start.getTime())) throw new ValidationError('invalid_logistics_date', 'Неверная дата');
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

@Injectable()
export class LogisticsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async availability(date?: string, zoneId?: string) {
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

  async checkoutOptions(date?: string) {
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

  async resolveStorePoint(storePointId?: string, legacyAlias?: string, requireSelection = false) {
    const alias = legacyAlias?.trim();
    const knownCode = alias === 'alistore-center' || alias === 'AliStore Центр' ? 'center' : alias?.toLowerCase();
    const point = storePointId
      ? await this.prisma.storePoint.findFirst({ where: { id: storePointId, active: true } })
      : alias
        ? await this.prisma.storePoint.findFirst({
            where: {
              active: true,
              OR: [{ code: knownCode }, { inventoryLocation: alias.toUpperCase() }],
            },
          })
        : requireSelection
          ? null
          : await this.prisma.storePoint.findFirst({
              where: { active: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            });
    if (!point) {
      throw new ValidationError(
        storePointId ? 'store_point_unavailable' : 'store_point_required',
        storePointId ? 'Точка недоступна или отключена' : 'Нет доступной точки выполнения заказа',
      );
    }
    return point;
  }

  async overview(date?: string) {
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

  createStorePoint(dto: CreateStorePointDto, actor: string, rawKey?: string) {
    const idempotencyKey = key(rawKey);
    const code = dto.code.trim().toLowerCase();
    const inventoryLocation = dto.inventoryLocation.trim().toUpperCase();
    return this.audit.transaction(async (tx) => {
      const replay = await tx.storePoint.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.code !== code || replay.inventoryLocation !== inventoryLocation) {
          throw new ConflictError('store_point_idempotency_mismatch', 'Ключ уже использован для другой точки');
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
          type: EventType.StorePointCreated,
          actor,
          payload: { storePointId: point.id, code, inventoryLocation, active: point.active },
          refs: [point.id, inventoryLocation],
        }],
      };
    });
  }

  updateStorePoint(id: string, dto: UpdateStorePointDto, actor: string, rawKey?: string) {
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
          throw new ConflictError('store_point_idempotency_mismatch', 'Ключ уже использован для другого изменения');
        }
        return { result: replay.response, events: [] };
      }
      await tx.$queryRaw`SELECT id FROM "StorePoint" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.storePoint.findUnique({ where: { id } });
      if (!current) throw new ValidationError('store_point_not_found', 'Точка не найдена');
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
      const response = JSON.parse(JSON.stringify(point)) as Prisma.InputJsonValue;
      await tx.storePointCommand.create({ data: { idempotencyKey, storePointId: id, fingerprint, response } });
      return {
        result: response,
        events: [{
          type: EventType.StorePointUpdated,
          actor,
          payload: { storePointId: id, before: current, after: point },
          refs: [id, point.inventoryLocation],
        }],
      };
    });
  }

  createZone(dto: CreateDeliveryZoneDto, actor: string, rawKey?: string) {
    const idempotencyKey = key(rawKey);
    if (dto.etaMaxMinutes < dto.etaMinMinutes) throw new ValidationError('invalid_zone_eta', 'Максимальное ETA меньше минимального');
    const code = dto.code.trim().toLowerCase();
    return this.audit.transaction(async (tx) => {
      const replay = await tx.deliveryZone.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.code !== code || replay.fee !== dto.fee) throw new ConflictError('logistics_idempotency_mismatch', 'Ключ уже использован для другой зоны');
        return { result: replay, events: [] };
      }
      const zone = await tx.deliveryZone.create({ data: { code, name: dto.name.trim(), fee: dto.fee, etaMinMinutes: dto.etaMinMinutes, etaMaxMinutes: dto.etaMaxMinutes, active: dto.active ?? true, createdBy: actor, idempotencyKey } });
      return { result: zone, events: [{ type: EventType.DeliveryZoneCreated, actor, payload: { zoneId: zone.id, code, fee: zone.fee }, refs: [zone.id] }] };
    });
  }

  createSlot(dto: CreateDeliverySlotDto, actor: string, rawKey?: string) {
    const idempotencyKey = key(rawKey);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new ValidationError('invalid_slot_window', 'Конец слота должен быть позже начала');
    return this.audit.transaction(async (tx) => {
      const replay = await tx.deliverySlot.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.zoneId !== dto.zoneId || replay.startsAt.getTime() !== startsAt.getTime() || replay.capacity !== dto.capacity) throw new ConflictError('logistics_idempotency_mismatch', 'Ключ уже использован для другого слота');
        return { result: replay, events: [] };
      }
      const zone = await tx.deliveryZone.findUnique({ where: { id: dto.zoneId } });
      if (!zone?.active) throw new ValidationError('delivery_zone_unavailable', 'Зона не найдена или отключена');
      const slot = await tx.deliverySlot.create({ data: { zoneId: dto.zoneId, startsAt, endsAt, capacity: dto.capacity, createdBy: actor, idempotencyKey } });
      return { result: slot, events: [{ type: EventType.DeliverySlotCreated, actor, payload: { slotId: slot.id, zoneId: slot.zoneId, startsAt, endsAt, capacity: slot.capacity }, refs: [slot.id, slot.zoneId] }] };
    });
  }
}
