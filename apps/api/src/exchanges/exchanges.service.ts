import { Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { assertTransition } from '../orders/order-state-machine';
import { ExchangeDto } from './exchanges.dto';
import { UnitsService } from '../units/units.service';
import { paymentAccountCode, postAccountingEntryOnTx } from '../finance/accounting-journal';
import { outputTaxMetadata, salesTaxSnapshot } from '../finance/sales-tax';
import { reverseInventoryCostOnTx } from '../inventory/inventory-valuation';
import { createQuarantineCaseOnTx } from '../inventory/inventory-quarantine';

const SURCHARGE_METHODS = new Set<PaymentMethod>([
  PaymentMethod.cash,
  PaymentMethod.card,
  PaymentMethod.qr_mbank,
  PaymentMethod.qr_odengi,
  PaymentMethod.bakai_pos,
  PaymentMethod.obank,
]);

/**
 * Обмен товара — atomic return + sale + surcharge in one transaction:
 *   old unit sold → returned, a Return(reconciled, exchange) is recorded, the
 *   original order → exchanged; a new paid order for the new device is created,
 *   its unit sold, and the price difference (доплата ≥ 0) collected as a payment.
 * A cheaper exchange (money back) is refused here — that path is a return + the
 * approval-gated refund, so cash-back never bypasses approval.
 */
@Injectable()
export class ExchangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
  ) {}

  async exchange(dto: ExchangeDto, actor: string, idempotencyKey?: string) {
    const key = idempotencyKey?.trim() ? `exchange:${idempotencyKey.trim()}` : undefined;
    if (key) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
      if (existing) return this.replayExchange(existing, dto);
    }
    return this.audit.transaction(async (tx) => {
      if (key) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
        const existing = await tx.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
        if (existing) return { result: await this.replayExchange(existing, dto, tx), events: [] };
      }
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${dto.originalOrderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: dto.originalOrderId },
        include: { items: true },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${dto.originalOrderId} не найден`);
      }
      const oldItem = order.items.find((i) => i.imei === dto.oldImei);
      if (!oldItem) {
        throw new ValidationError('item_not_found', `IMEI ${dto.oldImei} не в этом заказе`);
      }
      const oldUnit = await tx.deviceUnit.findUnique({ where: { imei: dto.oldImei } });
      if (!oldUnit || oldUnit.status !== 'sold') {
        throw new ConflictError('not_exchangeable', `IMEI ${dto.oldImei} не продан — обмен невозможен`);
      }
      if (oldUnit.orderId !== order.id || oldItem.qty !== 1) {
        throw new ConflictError('exchange_unit_state_mismatch', 'Серийный товар не принадлежит выбранной строке заказа');
      }
      const oldConsignment = await tx.consignmentItem.findUnique({ where: { unitId: oldUnit.id }, select: { id: true } });
      if (oldConsignment) {
        throw new ConflictError('exchange_consignment_requires_return', 'Комиссионный товар обменивается через обычный возврат');
      }
      assertTransition(order.status, 'exchanged');

      const newProduct = await tx.product.findUnique({ where: { id: dto.newProductId } });
      if (!newProduct) {
        throw new ValidationError('product_not_found', 'Новый товар не найден');
      }
      const creditAmount = oldItem.price - oldItem.discountAmount;
      if (creditAmount <= 0) {
        throw new ConflictError('exchange_credit_invalid', 'У возвращаемого товара нет положительной зачётной стоимости');
      }
      const exactSurcharge = newProduct.price - creditAmount;
      if (exactSurcharge < 0) {
        throw new ValidationError(
          'exchange_needs_refund',
          'Новый товар дешевле — оформите возврат + refund (через approval)',
        );
      }
      if (!SURCHARGE_METHODS.has(dto.method)) {
        throw new ValidationError('exchange_surcharge_method_invalid', 'Этот способ доплаты для обмена не поддерживается');
      }
      const expectedLocation = order.fulfillmentLocation ?? order.storePointCode;
      const newUnit = await tx.deviceUnit.findFirst({
        where: { productId: newProduct.id, status: 'in_stock', ...(expectedLocation ? { location: expectedLocation } : {}) },
        orderBy: { id: 'asc' },
      });
      if (!newUnit) {
        throw new ConflictError('no_stock', `Нет свободных единиц ${newProduct.sku}`);
      }
      const newConsignment = await tx.consignmentItem.findUnique({ where: { unitId: newUnit.id }, select: { id: true } });
      if (newConsignment) {
        throw new ConflictError('exchange_consignment_requires_return', 'Комиссионный товар нельзя выдать как замену');
      }

      const point = order.storePointCode ?? newUnit.location;
      const externalReference = dto.externalReference?.trim() || null;
      const cashShift = exactSurcharge > 0 && dto.method === PaymentMethod.cash
        ? await this.resolveCashShiftOnTx(tx, dto.shiftId, actor, point)
        : null;
      if (exactSurcharge > 0 && dto.method !== PaymentMethod.cash && !externalReference) {
        throw new ValidationError('exchange_external_reference_required', 'Для безналичной доплаты нужен внешний reference');
      }
      const newTax = salesTaxSnapshot([{
        lineNumber: 1,
        grossAmount: newProduct.price,
        taxCode: newProduct.taxCode,
        taxRateBps: newProduct.taxRateBps,
      }], newProduct.price);
      const oldTaxAmount = Math.min(oldItem.taxAmount, creditAmount);
      const oldRevenueAmount = creditAmount - oldTaxAmount;
      const oldTaxMetadata = outputTaxMetadata([oldItem]);

      const events: AuditInput[] = [];

      // 1) return the old unit
      const returned = await tx.deviceUnit.updateMany({
        where: { imei: dto.oldImei, status: 'sold', orderId: order.id },
        data: { status: 'returned', orderId: null },
      });
      if (returned.count !== 1) throw new ConflictError('exchange_unit_race', 'Товар уже изменён другой операцией');
      events.push({
        type: EventType.UnitReturned,
        actor,
        payload: { imei: dto.oldImei, orderId: order.id },
        refs: [order.id, dto.oldImei],
      });
      const ret = await tx.return.create({
        data: {
          orderId: order.id,
          reason: 'обмен',
          status: 'reconciled',
          refundAmount: creditAmount,
          isFullOrder: order.items.length === 1,
          items: { create: { orderItemId: oldItem.id, qty: 1, refundAmount: creditAmount } },
        },
      });
      const oldIssue = await tx.inventoryValuationIssue.findFirst({
        where: { orderId: order.id, imei: dto.oldImei, sourceType: 'sale', reversedQty: 0 },
        orderBy: { createdAt: 'desc' },
      });
      const quarantine = await createQuarantineCaseOnTx(tx, {
        unitId: oldUnit.id,
        sourceType: 'exchange',
        returnId: ret.id,
        reason: 'обмен',
        unitCost: oldIssue?.unitCost ?? oldUnit.acquisitionCost ?? 0,
        actor,
      });
      events.push({
        type: EventType.InventoryQuarantined,
        actor,
        payload: { quarantineId: quarantine.id, returnId: ret.id, orderId: order.id, imei: dto.oldImei, location: oldUnit.location },
        refs: [quarantine.id, ret.id, order.id, dto.oldImei],
      });
      events.push({
        type: EventType.ReturnCompleted,
        actor,
        payload: { returnId: ret.id, orderId: order.id, kind: 'exchange' },
        refs: [ret.id, order.id],
      });
      const oldSaleReversal = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:exchange:return:${ret.id}`,
        sourceType: 'exchange.return',
        sourceRef: ret.id,
        description: `Сторно продажи при обмене ${ret.id}`,
        point,
        documentAmount: creditAmount,
        baseAmount: creditAmount,
        taxCode: oldTaxMetadata.taxCode,
        taxRateBps: oldTaxMetadata.taxRateBps,
        taxAmount: oldTaxAmount,
        occurredAt: new Date(),
        createdBy: actor,
        lines: [
          ...(oldRevenueAmount > 0 ? [{ accountCode: '4000', debit: oldRevenueAmount, memo: 'Сторно выручки возвращённого товара' }] : []),
          ...(oldTaxAmount > 0 ? [{ accountCode: '2200', debit: oldTaxAmount, memo: 'Сторно исходящего НДС возвращённого товара' }] : []),
          { accountCode: '1100', credit: creditAmount, memo: 'Кредит покупателя для обмена' },
        ],
      });
      events.push(accountingEvent(actor, oldSaleReversal.id, 'exchange.return', ret.id, creditAmount, [ret.id, order.id]));
      if (oldIssue) {
        const oldCost = await reverseInventoryCostOnTx(tx, { issueId: oldIssue.id, quantity: 1, returnId: ret.id, actor });
        events.push(accountingEvent(actor, oldCost.entry.id, 'inventory.return', oldIssue.id, oldCost.totalCost, [ret.id, order.id, dto.oldImei]));
      }

      // 2) new paid order for the new device
      const newOrder = await tx.order.create({
        data: {
          customerId: order.customerId,
          idempotencyKey: key,
          channel: 'exchange',
          storePointCode: point,
          fulfillmentLocation: newUnit.location,
          subtotal: newProduct.price,
          total: newProduct.price,
          taxBaseAmount: newTax.taxBaseAmount,
          taxAmount: newTax.taxAmount,
          status: 'paid',
          items: { create: [{
            lineNumber: 1,
            sku: newProduct.sku,
            qty: 1,
            price: newProduct.price,
            unitCost: newUnit.acquisitionCost ?? newProduct.cost,
            taxCode: newTax.lines[0].taxCode,
            taxRateBps: newTax.lines[0].taxRateBps,
            taxBaseAmount: newTax.lines[0].taxBaseAmount,
            taxAmount: newTax.lines[0].taxAmount,
            imei: newUnit.imei,
          }] },
        },
      });
      await this.units.reserveOnTx(tx, newUnit.imei, newOrder.id);
      await this.units.sellOnTx(tx, newUnit.imei, newOrder.id, actor);
      const newTaxMetadata = outputTaxMetadata(newTax.lines);
      const replacementSale = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:exchange:sale:${newOrder.id}`,
        sourceType: 'exchange.sale',
        sourceRef: newOrder.id,
        description: `Продажа замены по обмену ${newOrder.id}`,
        point,
        documentAmount: newProduct.price,
        baseAmount: newProduct.price,
        taxCode: newTaxMetadata.taxCode,
        taxRateBps: newTaxMetadata.taxRateBps,
        taxAmount: newTax.taxAmount,
        occurredAt: new Date(),
        createdBy: actor,
        lines: [
          { accountCode: '1100', debit: newProduct.price, memo: 'Дебиторка по товару-замене' },
          ...(newTax.taxBaseAmount > 0 ? [{ accountCode: '4000', credit: newTax.taxBaseAmount, memo: 'Выручка по товару-замене' }] : []),
          ...(newTax.taxAmount > 0 ? [{ accountCode: '2200', credit: newTax.taxAmount, memo: 'Исходящий НДС по товару-замене' }] : []),
        ],
      });
      events.push(accountingEvent(actor, replacementSale.id, 'exchange.sale', newOrder.id, newProduct.price, [newOrder.id, ret.id]));
      const replacementIssue = await tx.inventoryValuationIssue.findFirst({
        where: { orderId: newOrder.id, imei: newUnit.imei, sourceType: 'sale' },
        orderBy: { createdAt: 'desc' },
      });
      if (replacementIssue) {
        const cogsEntry = await tx.accountingJournalEntry.findUnique({
          where: { sourceType_sourceRef: { sourceType: 'inventory.cogs', sourceRef: replacementIssue.id } },
        });
        if (cogsEntry) events.push(accountingEvent(actor, cogsEntry.id, 'inventory.cogs', replacementIssue.id, replacementIssue.totalCost, [newOrder.id, newUnit.imei]));
      }
      events.push(
        { type: EventType.OrderCreated, actor, payload: { orderId: newOrder.id, channel: 'exchange' }, refs: [newOrder.id] },
        { type: EventType.UnitSold, actor, payload: { orderId: newOrder.id, imei: newUnit.imei }, refs: [newOrder.id, newUnit.imei] },
        { type: EventType.OrderPaid, actor, payload: { orderId: newOrder.id, total: newProduct.price }, refs: [newOrder.id] },
      );

      // 3) collect surcharge (доплата)
      if (exactSurcharge > 0) {
        const payment = await tx.payment.create({
          data: {
            orderId: newOrder.id,
            amount: exactSurcharge,
            method: dto.method,
            status: 'received',
            shiftId: cashShift?.id,
            point,
            receivedBy: actor,
            txnId: externalReference,
            idempotencyKey: `exchange:${newOrder.id}:surcharge`,
            accountCode: paymentAccountCode(dto.method),
          },
        });
        const surchargeEntry = await postAccountingEntryOnTx(tx, {
          idempotencyKey: `accounting:exchange:surcharge:${payment.id}`,
          sourceType: 'exchange.surcharge',
          sourceRef: payment.id,
          description: `Доплата по обмену ${newOrder.id}`,
          point,
          documentAmount: exactSurcharge,
          baseAmount: exactSurcharge,
          occurredAt: payment.createdAt,
          createdBy: actor,
          lines: [
            { accountCode: paymentAccountCode(dto.method), debit: exactSurcharge, memo: 'Получена доплата по обмену' },
            { accountCode: '1100', credit: exactSurcharge, memo: 'Погашение дебиторки по обмену' },
          ],
        });
        await tx.payment.update({ where: { id: payment.id }, data: { accountingEntryId: surchargeEntry.id } });
        events.push(accountingEvent(actor, surchargeEntry.id, 'exchange.surcharge', payment.id, exactSurcharge, [newOrder.id, payment.id]));
        events.push({
          type: EventType.PaymentReceived,
          actor,
          payload: { orderId: newOrder.id, amount: exactSurcharge, method: dto.method, kind: 'exchange_surcharge', shiftId: cashShift?.id ?? null, externalReference },
          refs: [newOrder.id, payment.id],
        });
      }

      // 4) original order → exchanged
      const fullOrderExchange = order.items.length === 1;
      if (fullOrderExchange) {
        await tx.order.update({ where: { id: order.id }, data: { status: 'exchanged' } });
      }
      events.push({
        type: EventType.OrderExchanged,
        actor,
        payload: { orderId: order.id, into: newOrder.id, returnId: ret.id, oldImei: dto.oldImei, newImei: newUnit.imei, creditAmount, surcharge: exactSurcharge, method: dto.method, fullOrderExchange },
        refs: [order.id, newOrder.id],
      });

      return {
        result: {
          exchangeOrderId: newOrder.id,
          returnId: ret.id,
          surcharge: exactSurcharge,
          oldImei: dto.oldImei,
          newImei: newUnit.imei,
          idempotent: false,
        },
        events,
      };
    });
  }

  private async replayExchange(
    exchangeOrder: { id: string; items: { sku: string; imei: string | null }[] },
    dto: ExchangeDto,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const [product, event, payment] = await Promise.all([
      db.product.findUnique({ where: { id: dto.newProductId } }),
      db.auditEvent.findFirst({ where: { type: EventType.OrderExchanged, refs: { has: exchangeOrder.id } }, orderBy: { ts: 'desc' } }),
      db.payment.findFirst({ where: { orderId: exchangeOrder.id, amount: { gt: 0 } }, orderBy: { createdAt: 'asc' } }),
    ]);
    const payload = (event?.payload ?? {}) as Record<string, unknown>;
    const returnId = typeof payload.returnId === 'string' ? payload.returnId : '';
    const ret = returnId ? await db.return.findUnique({ where: { id: returnId } }) : null;
    const requestedShiftId = dto.shiftId?.trim() || null;
    const surcharge = typeof payload.surcharge === 'number' ? payload.surcharge : payment?.amount ?? 0;
    if (
      !product || exchangeOrder.items[0]?.sku !== product.sku ||
      payload.orderId !== dto.originalOrderId || payload.oldImei !== dto.oldImei || payload.method !== dto.method || !ret ||
      (surcharge > 0 && (payment?.txnId ?? null) !== (dto.externalReference?.trim() || null)) ||
      (requestedShiftId !== null && (payment?.shiftId ?? null) !== requestedShiftId)
    ) {
      throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован для другого обмена');
    }
    return {
      exchangeOrderId: exchangeOrder.id,
      returnId: ret.id,
      surcharge,
      oldImei: dto.oldImei,
      newImei: exchangeOrder.items[0]?.imei ?? String(payload.newImei ?? ''),
      idempotent: true,
    };
  }

  private async resolveCashShiftOnTx(
    tx: Prisma.TransactionClient,
    requestedShiftId: string | undefined,
    actor: string,
    point: string,
  ) {
    const shift = requestedShiftId?.trim()
      ? await tx.cashShift.findUnique({ where: { id: requestedShiftId.trim() } })
      : await tx.cashShift.findFirst({ where: { staffId: actor, point, closedAt: null }, orderBy: { openedAt: 'desc' } });
    if (!shift) throw new ConflictError('cash_shift_required', 'Для наличной доплаты нужна открытая кассовая смена');
    await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${shift.id} FOR UPDATE`;
    const locked = await tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } });
    if (locked.staffId !== actor) throw new ConflictError('cash_shift_foreign', 'Кассовая смена принадлежит другому сотруднику');
    if (locked.closedAt) throw new ConflictError('cash_shift_closed', 'Кассовая смена уже закрыта');
    if (locked.point !== point) throw new ConflictError('cash_shift_wrong_point', 'Кассовая смена открыта в другой точке');
    return locked;
  }
}

function accountingEvent(
  actor: string,
  accountingEntryId: string,
  sourceType: string,
  sourceRef: string,
  amount: number,
  refs: string[],
): AuditInput {
  return {
    type: EventType.AccountingEntryPosted,
    actor,
    payload: { accountingEntryId, sourceType, sourceRef, amount },
    refs: [accountingEntryId, ...refs],
  };
}
