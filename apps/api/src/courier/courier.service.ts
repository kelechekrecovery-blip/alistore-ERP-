import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { CompleteDeliveryDto, CreateRunDto, FailDeliveryDto, HandoverDto } from './courier.dto';
import { OutboxService } from '../outbox/outbox.service';

const ASSIGNABLE_STATUSES = ['paid', 'packed'] as const;
const SETTLED_PAYMENT_STATUSES = new Set(['received', 'reconciled']);

@Injectable()
export class CourierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  listMine(courierId: string) {
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

  async getRun(id: string, expectedCourierId?: string) {
    const run = await this.prisma.courierRun.findUnique({ where: { id }, include: { orders: true } });
    if (run && expectedCourierId && run.courierId !== expectedCourierId) {
      throw new ForbiddenError('courier_run_forbidden', 'Рейс назначен другому курьеру');
    }
    return run;
  }

  async createRun(dto: CreateRunDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const courier = await tx.staffUser.findUnique({ where: { id: dto.courierId } });
      if (!courier || !courier.active || courier.role !== 'courier') {
        throw new ValidationError('courier_not_available', 'Нужен активный сотрудник с ролью courier');
      }
      const orderIds = [...new Set(dto.orderIds ?? [])];
      const orders = orderIds.length > 0
        ? await tx.order.findMany({ where: { id: { in: orderIds } }, include: { payments: true } })
        : [];
      if (orders.length !== orderIds.length) {
        throw new ValidationError('order_not_found', 'Один или несколько заказов доставки не найдены');
      }
      for (const order of orders) {
        if (order.isDemo) throw new ValidationError('demo_order_blocked', 'Демо-заказ нельзя передать в доставку');
        if (order.fulfillmentType !== 'courier') {
          throw new ValidationError('courier_fulfillment_required', `Заказ ${order.id} не является доставкой`);
        }
        if (!(ASSIGNABLE_STATUSES as readonly string[]).includes(order.status)) {
          throw new ConflictError('order_not_assignable', `Заказ ${order.id} нельзя назначить из статуса ${order.status}`);
        }
      }
      const serverCod = orders.reduce((sum, order) => sum + outstandingAmount(order), 0);
      if (orders.length > 0 && dto.codTotal !== serverCod) {
        throw new ValidationError('cod_total_mismatch', `Ожидаемый COD по выбранным заказам: ${serverCod}`);
      }
      const run = await tx.courierRun.create({
        data: {
          courierId: dto.courierId,
          codTotal: orders.length > 0 ? serverCod : dto.codTotal,
          collectedTotal: orders.length > 0 ? 0 : dto.codTotal,
        },
      });
      const events: AuditInput[] = [{
        type: EventType.DeliveryAssigned,
        actor,
        payload: { runId: run.id, courierId: dto.courierId, codTotal: run.codTotal, orderIds },
        refs: [run.id, ...orderIds],
      }];
      for (const order of orders) {
        const updated = await tx.order.updateMany({
          where: { id: order.id, status: order.status, courierId: null },
          data: { status: 'courier_assigned', courierId: dto.courierId, courierRunId: run.id },
        });
        if (updated.count !== 1) throw new ConflictError('order_assignment_race', `Заказ ${order.id} уже назначен`);
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

  startDelivery(orderId: string, courierId: string, idempotencyKey: string) {
    return this.executeCommand(orderId, courierId, idempotencyKey, 'start', {}, async (tx, order) => {
      if (order.status !== 'courier_assigned') {
        throw new ConflictError('delivery_not_assigned', `Заказ ${orderId} имеет статус ${order.status}`);
      }
      const updated = await tx.order.updateMany({
        where: { id: orderId, courierId, status: 'courier_assigned' },
        data: { status: 'out_for_delivery' },
      });
      if (updated.count !== 1) throw new ConflictError('delivery_transition_race', 'Доставка уже изменена');
      const result = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      return { result, events: [{
        type: EventType.DeliveryOut,
        actor: courierId,
        payload: { orderId, from: 'courier_assigned', to: 'out_for_delivery' },
        refs: [orderId, order.courierRunId].filter((value): value is string => Boolean(value)),
      }] };
    });
  }

  completeDelivery(orderId: string, dto: CompleteDeliveryDto, courierId: string, idempotencyKey: string) {
    return this.executeCommand(orderId, courierId, idempotencyKey, 'deliver', { codAmount: dto.codAmount }, async (tx, order) => {
      if (order.status !== 'out_for_delivery') {
        throw new ConflictError('delivery_not_out', `Заказ ${orderId} имеет статус ${order.status}`);
      }
      const expectedCod = outstandingAmount(order);
      if (dto.codAmount !== expectedCod) {
        throw new ValidationError('delivery_cod_mismatch', `Для заказа требуется получить ${expectedCod} сом`);
      }
      const updated = await tx.order.updateMany({
        where: { id: orderId, courierId, status: 'out_for_delivery' },
        data: { status: 'delivered' },
      });
      if (updated.count !== 1) throw new ConflictError('delivery_transition_race', 'Доставка уже изменена');
      if (order.courierRunId && dto.codAmount > 0) {
        await tx.courierRun.update({
          where: { id: order.courierRunId },
          data: { collectedTotal: { increment: dto.codAmount } },
        });
      }
      const result = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      return { result, events: [{
        type: EventType.DeliveryDelivered,
        actor: courierId,
        payload: { orderId, from: 'out_for_delivery', to: 'delivered', codAmount: dto.codAmount },
        refs: [orderId, order.courierRunId].filter((value): value is string => Boolean(value)),
      }] };
    });
  }

  failDelivery(orderId: string, dto: FailDeliveryDto, courierId: string, idempotencyKey: string) {
    const payload = { reason: dto.reason.trim(), evidence: dto.evidence ?? null };
    if (!payload.reason) throw new ValidationError('failure_reason_required', 'Укажите причину неуспешной доставки');
    return this.executeCommand(orderId, courierId, idempotencyKey, 'fail', payload, async (_tx, order) => {
      if (order.status !== 'out_for_delivery') {
        throw new ConflictError('delivery_not_out', `Заказ ${orderId} имеет статус ${order.status}`);
      }
      const result = { orderId, recorded: true, status: order.status };
      return { result, events: [{
        type: EventType.DeliveryFailed,
        actor: courierId,
        payload: { orderId, ...payload },
        refs: [orderId, order.courierRunId].filter((value): value is string => Boolean(value)),
      }] };
    });
  }

  async handover(dto: HandoverDto, actor: string, expectedCourierId?: string) {
    return this.audit.transaction(async (tx) => {
      const run = await tx.courierRun.findUnique({ where: { id: dto.runId } });
      if (!run) throw new ValidationError('run_not_found', `Курьерский рейс ${dto.runId} не найден`);
      if (expectedCourierId && run.courierId !== expectedCourierId) {
        throw new ForbiddenError('courier_run_forbidden', 'Рейс назначен другому курьеру');
      }
      if (run.handedOver) throw new ConflictError('cod_already_handed_over', `COD по рейсу ${dto.runId} уже сдан`);
      if (run.collectedTotal !== run.codTotal) {
        throw new ConflictError('run_delivery_incomplete', `Собрано ${run.collectedTotal} из ${run.codTotal} сом`);
      }
      const diff = dto.amount - run.codTotal;
      if (diff !== 0 && !dto.reason?.trim()) {
        throw new ValidationError('handover_reason_required', `Расхождение COD ${diff} сом требует причину`);
      }
      const settled = await tx.courierRun.update({ where: { id: dto.runId }, data: { handedOver: true } });
      const events: AuditInput[] = [{
        type: EventType.CashHandover,
        actor,
        payload: { runId: dto.runId, codTotal: run.codTotal, amount: dto.amount, diff, reason: dto.reason ?? null },
        refs: [dto.runId],
      }];
      if (diff !== 0) events.push({
        type: EventType.CashShortage,
        actor,
        payload: { runId: dto.runId, diff, reason: dto.reason },
        refs: [dto.runId],
      });
      return { result: { ...settled, diff }, events };
    });
  }

  private async executeCommand<T>(
    orderId: string,
    courierId: string,
    idempotencyKey: string,
    action: string,
    payload: Record<string, unknown>,
    work: (tx: Prisma.TransactionClient, order: CourierOrder) => Promise<{ result: T; events: AuditInput[] }>,
  ): Promise<T> {
    const key = idempotencyKey.trim();
    if (!key || key.length > 128) throw new ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
    const replay = await this.prisma.courierCommand.findUnique({ where: { idempotencyKey: key } });
    if (replay) return replayCommand<T>(replay, courierId, orderId, action, payload);
    try {
      return await this.audit.transaction(async (tx) => {
        const existing = await tx.courierCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing) return { result: replayCommand<T>(existing, courierId, orderId, action, payload), events: [] };
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { payments: { select: { amount: true, status: true } } },
        });
        if (!order) throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
        if (order.courierId !== courierId) throw new ForbiddenError('delivery_forbidden', 'Доставка назначена другому курьеру');
        await tx.courierCommand.create({
          data: { idempotencyKey: key, courierId, orderId, action, payload: payload as Prisma.InputJsonValue },
        });
        const outcome = await work(tx, order);
        await tx.courierCommand.update({
          where: { idempotencyKey: key },
          data: { response: JSON.parse(JSON.stringify(outcome.result)) as Prisma.InputJsonValue },
        });
        return outcome;
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const raced = await this.prisma.courierCommand.findUniqueOrThrow({ where: { idempotencyKey: key } });
        return replayCommand<T>(raced, courierId, orderId, action, payload);
      }
      throw error;
    }
  }
}

type CourierOrder = Prisma.OrderGetPayload<{
  include: { payments: { select: { amount: true; status: true } } };
}>;

function outstandingAmount(order: { total: number; payments: Array<{ amount: number; status: string }> }): number {
  const paid = order.payments
    .filter((payment) => payment.amount > 0 && SETTLED_PAYMENT_STATUSES.has(payment.status))
    .reduce((sum, payment) => sum + payment.amount, 0);
  return Math.max(0, order.total - paid);
}

function replayCommand<T>(
  command: { courierId: string; orderId: string; action: string; payload: unknown; response: unknown },
  courierId: string,
  orderId: string,
  action: string,
  payload: Record<string, unknown>,
): T {
  const same = command.courierId === courierId
    && command.orderId === orderId
    && command.action === action
    && JSON.stringify(command.payload) === JSON.stringify(payload);
  if (!same) throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой courier-командой');
  if (command.response === null || command.response === undefined) {
    throw new ConflictError('command_in_progress', 'Courier-команда ещё выполняется');
  }
  return command.response as T;
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
