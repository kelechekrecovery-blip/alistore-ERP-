import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { CompleteDeliveryDto, CreateRunDto, FailDeliveryDto, HandoverDto, RemoveFromRunDto } from './courier.dto';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { assertCourierRunOwner, replayCourierHandover } from './courier-handover';
import { postAccountingEntryOnTx, postOrderReceivableOnTx } from '../finance/accounting-journal';
import { UnitsService } from '../units/units.service';
import {
  assertOrderInventoryFinalizedOnTx,
  assertOrderReservationCoverageOnTx,
  finalizeOrderInventorySaleOnTx,
  orderHasTrackedInventoryOnTx,
} from '../inventory/order-inventory-sale';

const ASSIGNABLE_STATUSES = ['paid', 'packed'] as const;
const REMOVABLE_FROM_RUN_STATUSES = ['courier_assigned', 'out_for_delivery'] as const;
const SETTLED_PAYMENT_STATUSES = new Set(['received', 'reconciled']);

@Injectable()
export class CourierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly units: UnitsService,
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

  async createRun(dto: CreateRunDto, actor: string, idempotencyKey: string) {
    const key = requireIdempotencyKey(idempotencyKey);
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'courier-run-key:' + key}))`;
      const existing = await tx.courierRun.findUnique({
        where: { assignmentIdempotencyKey: key },
        include: { orders: { select: { id: true } } },
      });
      if (existing) return { result: replayRunAssignment(existing, dto), events: [] };
      const courier = await tx.staffUser.findUnique({ where: { id: dto.courierId } });
      if (!courier || !courier.active || courier.role !== 'courier') {
        throw new ValidationError('courier_not_available', 'Нужен активный сотрудник с ролью courier');
      }
      const orderIds = [...new Set(dto.orderIds ?? [])].sort();
      if (orderIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`
          SELECT id
          FROM "Order"
          WHERE id IN (${Prisma.join(orderIds)})
          ORDER BY id
          FOR UPDATE
        `);
      }
      const orders = orderIds.length > 0
        ? await tx.order.findMany({
          where: { id: { in: orderIds } },
          include: { payments: true },
          orderBy: { id: 'asc' },
        })
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
        if (order.paymentMode !== 'cod' && outstandingAmount(order) > 0) {
          throw new ConflictError('order_payment_unsettled', `Предоплаченный заказ ${order.id} нельзя назначить до полной оплаты`);
        }
      }
      const serverCod = orders.reduce((sum, order) => sum + outstandingAmount(order), 0);
      if (orders.length > 0 && dto.codTotal !== serverCod) {
        throw new ValidationError('cod_total_mismatch', `Ожидаемый COD по выбранным заказам: ${serverCod}`);
      }
      const run = await tx.courierRun.create({
        data: {
          assignmentIdempotencyKey: key,
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
    return this.executeCommand(orderId, courierId, idempotencyKey, 'deliver', {
      codAmount: dto.codAmount,
      reason: dto.reason?.trim() || null,
      evidenceIdempotencyKey: dto.evidenceIdempotencyKey ?? null,
    }, async (tx, order) => {
      if (order.status !== 'out_for_delivery') {
        throw new ConflictError('delivery_not_out', `Заказ ${orderId} имеет статус ${order.status}`);
      }
      const expectedCod = outstandingAmount(order);
      const reason = dto.reason?.trim() || null;
      if (dto.codAmount > expectedCod) {
        throw new ValidationError('delivery_cod_mismatch', `Нельзя получить больше задолженности ${expectedCod} сом`);
      }
      if (dto.codAmount < expectedCod && !reason) {
        throw new ValidationError('delivery_partial_cod_reason_required', 'Для частичной оплаты COD требуется причина');
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
      const receivedBefore = settledAmount(order);
      const inventoryEvents: AuditInput[] = [];
      if (receivedBefore < order.total) {
        if (await orderHasTrackedInventoryOnTx(tx, orderId)) {
          await assertOrderReservationCoverageOnTx(tx, orderId, new Date(), { enforceExpiry: false });
          await finalizeOrderInventorySaleOnTx(tx, {
            orderId,
            actor: courierId,
            units: this.units,
            events: inventoryEvents,
          });
        }
      } else {
        if (await orderHasTrackedInventoryOnTx(tx, orderId)) {
          await assertOrderInventoryFinalizedOnTx(tx, orderId);
        }
      }
      const receivableEntry = expectedCod > 0
        ? await postOrderReceivableOnTx(tx, {
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
      const result = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      await enqueueConsentedCustomerNotice(tx, this.outbox, {
        customerId: order.customerId,
        template: 'order_delivered',
        payload: { orderId, codAmount: dto.codAmount, remainingReceivable: expectedCod - dto.codAmount },
        transactional: true,
      });
      return { result, events: [
        {
          type: EventType.DeliveryDelivered,
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
          refs: [orderId, order.courierRunId, dto.evidenceIdempotencyKey].filter((value): value is string => Boolean(value)),
        },
        ...inventoryEvents,
        ...(receivableEntry ? [{
          type: EventType.AccountingEntryPosted,
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

  failDelivery(orderId: string, dto: FailDeliveryDto, courierId: string, idempotencyKey: string) {
    const payload = {
      reason: dto.reason.trim(),
      evidence: dto.evidence ?? null,
      evidenceIdempotencyKey: dto.evidenceIdempotencyKey ?? null,
    };
    if (!payload.reason) throw new ValidationError('failure_reason_required', 'Укажите причину неуспешной доставки');
    return this.executeCommand(orderId, courierId, idempotencyKey, 'fail', payload, async (tx, order) => {
      if (order.status !== 'out_for_delivery') {
        throw new ConflictError('delivery_not_out', `Заказ ${orderId} имеет статус ${order.status}`);
      }
      await enqueueConsentedCustomerNotice(tx, this.outbox, {
        customerId: order.customerId,
        template: 'delivery_failed',
        payload: { orderId, reason: payload.reason },
        transactional: true,
      });
      const result = { orderId, recorded: true, status: order.status };
      return { result, events: [{
        type: EventType.DeliveryFailed,
        actor: courierId,
        payload: { orderId, ...payload },
        refs: [orderId, order.courierRunId, dto.evidenceIdempotencyKey].filter((value): value is string => Boolean(value)),
      }] };
    });
  }

  /**
   * Pull an undelivered order off its courier run (LOGIC-002): the order returns
   * to `paid` so it can be dispatched again, and the run COD total shrinks by the
   * order outstanding amount. Idempotent per courierCommand; the caller is the
   * run courier or a privileged staff actor (expectedCourierId undefined).
   */
  async removeOrderFromRun(
    orderId: string,
    dto: RemoveFromRunDto,
    actor: string,
    expectedCourierId: string | undefined,
    idempotencyKey: string,
  ) {
    const key = idempotencyKey.trim();
    if (!key || key.length > 128) throw new ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
    const payload = { reason: dto.reason.trim() };
    if (!payload.reason) throw new ValidationError('removal_reason_required', 'Укажите причину снятия заказа с рейса');
    const action = 'remove_from_run';
    const replay = await this.prisma.courierCommand.findUnique({ where: { idempotencyKey: key } });
    if (replay) return replayCommand<RemoveFromRunResult>(replay, actor, orderId, action, payload);
    try {
      return await this.audit.transaction(async (tx) => {
        const existing = await tx.courierCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing) return { result: replayCommand<RemoveFromRunResult>(existing, actor, orderId, action, payload), events: [] };
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { payments: { select: { amount: true, status: true } } },
        });
        if (!order) throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
        await tx.courierCommand.create({
          data: { idempotencyKey: key, courierId: actor, orderId, action, payload: payload as Prisma.InputJsonValue },
        });
        if (!order.courierRunId || !order.courierId) {
          throw new ConflictError('order_not_in_run', `Заказ ${orderId} не назначен на курьерский рейс`);
        }
        if (expectedCourierId && order.courierId !== expectedCourierId) {
          throw new ForbiddenError('delivery_forbidden', 'Доставка назначена другому курьеру');
        }
        if (!(REMOVABLE_FROM_RUN_STATUSES as readonly string[]).includes(order.status)) {
          throw new ConflictError('order_not_removable', `Заказ ${orderId} нельзя снять с рейса из статуса ${order.status}`);
        }
        // Serialize against a concurrent handover of the same run.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.courierRunId}))`;
        const run = await tx.courierRun.findUnique({ where: { id: order.courierRunId } });
        if (!run) throw new ValidationError('run_not_found', `Курьерский рейс ${order.courierRunId} не найден`);
        if (run.handedOver) throw new ConflictError('cod_already_handed_over', `COD по рейсу ${run.id} уже сдан`);
        const codReleased = outstandingAmount(order);
        const updated = await tx.order.updateMany({
          where: { id: orderId, status: order.status, courierRunId: run.id },
          data: { status: 'paid', courierId: null, courierRunId: null },
        });
        if (updated.count !== 1) throw new ConflictError('delivery_transition_race', 'Доставка уже изменена');
        const recalculated = await tx.courierRun.update({
          where: { id: run.id },
          data: { codTotal: { decrement: codReleased } },
        });
        const result: RemoveFromRunResult = {
          orderId,
          runId: run.id,
          status: 'paid',
          codReleased,
          codTotal: recalculated.codTotal,
          collectedTotal: recalculated.collectedTotal,
        };
        await tx.courierCommand.update({
          where: { idempotencyKey: key },
          data: { response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue },
        });
        return { result, events: [{
          type: EventType.DeliveryUnassigned,
          actor,
          payload: { orderId, runId: run.id, from: order.status, to: 'paid', codReleased, reason: payload.reason },
          refs: [orderId, run.id],
        }] };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const raced = await this.prisma.courierCommand.findUniqueOrThrow({ where: { idempotencyKey: key } });
        return replayCommand<RemoveFromRunResult>(raced, actor, orderId, action, payload);
      }
      throw error;
    }
  }

  async handover(dto: HandoverDto, actor: string, expectedCourierId: string | undefined, idempotencyKey: string) {
    const key = idempotencyKey.trim();
    if (!key || key.length > 128) throw new ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
    const normalized = { amount: dto.amount, reason: dto.reason?.trim() || null };
    const replay = await this.prisma.courierRun.findUnique({ where: { handoverIdempotencyKey: key } });
    if (replay) {
      assertCourierRunOwner(replay, expectedCourierId);
      return replayCourierHandover(replay, dto.runId, normalized);
    }
    try {
      return await this.audit.transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.runId}))`;
        const run = await tx.courierRun.findUnique({
          where: { id: dto.runId },
          include: { orders: { select: { id: true } } },
        });
        if (!run) throw new ValidationError('run_not_found', `Курьерский рейс ${dto.runId} не найден`);
        assertCourierRunOwner(run, expectedCourierId);
        if (run.handedOver) {
          if (run.handoverIdempotencyKey === key) {
            return { result: replayCourierHandover(run, dto.runId, normalized), events: [] };
          }
          throw new ConflictError('cod_already_handed_over', `COD по рейсу ${dto.runId} уже сдан`);
        }
        if (run.collectedTotal > run.codTotal) {
          throw new ConflictError('run_delivery_incomplete', `Собрано ${run.collectedTotal} из ${run.codTotal} сом`);
        }
        // Partial handover (collected < codTotal after failed/undelivered orders) requires a reason.
        if (run.collectedTotal < run.codTotal && !normalized.reason) {
          throw new ConflictError('run_delivery_incomplete', `Собрано ${run.collectedTotal} из ${run.codTotal} сом`);
        }
        const expected = run.collectedTotal;
        const diff = dto.amount - expected;
        if (diff !== 0 && !normalized.reason) {
          throw new ValidationError('handover_reason_required', `Расхождение COD ${diff} сом требует причину`);
        }
        if (run.orders.length > 0 && expected > 0) {
          const recognized = await tx.accountingJournalEntry.aggregate({
            where: { sourceType: 'cod.receivable', sourceRef: { in: run.orders.map((order) => order.id) } },
            _sum: { documentAmount: true },
          });
          if ((recognized._sum.documentAmount ?? 0) !== expected) {
            throw new ConflictError('cod_receivable_not_recognized', 'COD нельзя сдать до признания дебиторской задолженности всех доставок');
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
          ? await postAccountingEntryOnTx(tx, {
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
        const events: AuditInput[] = [{
          type: EventType.CashHandover,
          actor,
          payload: { runId: dto.runId, codTotal: run.codTotal, collectedTotal: run.collectedTotal, amount: dto.amount, diff, reason: normalized.reason },
          refs: [dto.runId],
        }];
        if (accountingEntry) events.push({
          type: EventType.AccountingEntryPosted,
          actor,
          payload: { accountingEntryId: accountingEntry.id, sourceType: 'cod.handover', sourceRef: `${dto.runId}:${key}`, amount: dto.amount, expected, diff },
          refs: [accountingEntry.id, dto.runId],
        });
        if (diff !== 0) events.push({
          type: EventType.CashShortage,
          actor,
          payload: { runId: dto.runId, diff, reason: normalized.reason },
          refs: [dto.runId],
        });
        return { result: { ...settled, diff }, events };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const raced = await this.prisma.courierRun.findUniqueOrThrow({ where: { handoverIdempotencyKey: key } });
        assertCourierRunOwner(raced, expectedCourierId);
        return replayCourierHandover(raced, dto.runId, normalized);
      }
      throw error;
    }
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
          include: {
            payments: { select: { amount: true, status: true } },
            items: { select: { taxCode: true, taxRateBps: true, taxAmount: true } },
          },
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
  include: {
    payments: { select: { amount: true; status: true } };
    items: { select: { taxCode: true; taxRateBps: true; taxAmount: true } };
  };
}>;

type RemoveFromRunResult = {
  orderId: string;
  runId: string;
  status: 'paid';
  codReleased: number;
  codTotal: number;
  collectedTotal: number;
};

function outstandingAmount(order: { total: number; payments: Array<{ amount: number; status: string }> }): number {
  return Math.max(0, order.total - settledAmount(order));
}

function settledAmount(order: { payments: Array<{ amount: number; status: string }> }): number {
  return order.payments
    .filter((payment) => payment.amount > 0 && SETTLED_PAYMENT_STATUSES.has(payment.status))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function requireIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 128) throw new ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
  return key;
}

function replayRunAssignment(
  existing: Prisma.CourierRunGetPayload<{ include: { orders: { select: { id: true } } } }>,
  dto: CreateRunDto,
) {
  const expectedOrderIds = [...new Set(dto.orderIds ?? [])].sort();
  const actualOrderIds = existing.orders.map((order) => order.id).sort();
  if (
    existing.courierId !== dto.courierId
    || existing.codTotal !== dto.codTotal
    || expectedOrderIds.length !== actualOrderIds.length
    || expectedOrderIds.some((id, index) => id !== actualOrderIds[index])
  ) {
    throw new ConflictError('courier_run_idempotency_mismatch', 'Idempotency-Key уже использован для другого рейса');
  }
  const { orders: _, ...run } = existing;
  return { ...run, orderIds: actualOrderIds };
}

function replayCommand<T>(
  command: { courierId: string; orderId: string; action: string; payload: unknown; response: unknown },
  courierId: string,
  orderId: string,
  action: string,
  payload: Record<string, unknown>,
): T {
  const storedPayload = normalizeReplayPayload(command.action, command.payload);
  const requestedPayload = normalizeReplayPayload(action, payload);
  const same = command.courierId === courierId
    && command.orderId === orderId
    && command.action === action
    && canonicalJson(storedPayload) === canonicalJson(requestedPayload);
  if (!same) throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой courier-командой');
  if (command.response === null || command.response === undefined) {
    throw new ConflictError('command_in_progress', 'Courier-команда ещё выполняется');
  }
  return command.response as T;
}

function normalizeReplayPayload(action: string, payload: unknown): unknown {
  if (action !== 'deliver' || !payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  return { ...record, reason: typeof record.reason === 'string' ? record.reason : null };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
