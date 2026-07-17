import { Injectable } from '@nestjs/common';
import { Payment } from '@prisma/client';
import { createHash } from 'crypto';
import { CustomersService } from '../customers/customers.service';
import { ShiftsService } from '../shifts/shifts.service';
import { UnitsService } from '../units/units.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { APPROVAL_THRESHOLDS } from '../rbac/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { PosSaleDto } from './pos.dto';
import { evaluateMarginControl, MarginControlResult, saleTotal } from './margin-control';

/** Walk-in retail customer — POS sales without a named buyer attach here. */
const WALKIN_PHONE = '+000000000000';

/**
 * Fallback POS idempotency window (M-5). Real clients (web/mobile) always send a
 * `clientSaleId`, which is the precise idempotency key. If one is missing, we derive a
 * deterministic key from the cart fingerprint bucketed into this window, so an accidental
 * network re-submit within the window collapses to one sale while a deliberate identical
 * re-ring in a later window is still processed as a new sale. Any replay is verified
 * against the stored sale composition (`saleRequestHash`); a fingerprint-keyed dedup is
 * flagged with `dedupedBy: 'fingerprint'` instead of silently substituting the sale, so
 * two genuinely different sales with the same cart must each carry their own clientSaleId.
 */
const POS_AUTO_DEDUP_WINDOW_MS = 60_000;

interface OrderLine {
  productId: string;
  sku: string;
  qty: number;
  price: number;
  imei?: string;
  unitCost: number;
  costRef?: string;
}

interface NormalizedPosPayment {
  method: NonNullable<PosSaleDto['method']>;
  amount: number;
}

/**
 * POS sale orchestration. One call performs the whole counter sale by composing the
 * invariant-guarded services in sequence:
 *   walk-in customer → open cash shift → assign in_stock IMEI units → order →
 *   reserve → payment (attached to the shift).
 * Each step is atomic on its own; a retry with the same idempotency key resumes a
 * half-finished sale at the failed step (LOGIC-012), and the reservation-expiry sweep
 * reclaims stock of sales that are never resumed, so a unit is never stranded.
 */
@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly shifts: ShiftsService,
    private readonly units: UnitsService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly approvals: ApprovalsService,
  ) {}

  async sale(dto: PosSaleDto) {
    const actor = dto.staffId;
    const requestedPoint = dto.point.trim();
    const knownCode = requestedPoint === 'alistore-center' || requestedPoint === 'AliStore Центр' ? 'center' : requestedPoint.toLowerCase();
    const storePoint = await this.prisma.storePoint.findFirst({
      where: {
        active: true,
        OR: [
          { id: requestedPoint },
          { code: knownCode },
          { inventoryLocation: requestedPoint.toUpperCase() },
        ],
      },
    });
    if (!storePoint) {
      throw new ValidationError('store_point_unavailable', 'Точка кассы недоступна или отключена');
    }
    const staff = await this.prisma.staffUser.findUnique({
      where: { id: actor },
      select: { active: true, point: true },
    });
    if (staff) {
      if (!staff.active) throw new ForbiddenError('staff_inactive', 'Учётная запись сотрудника отключена');
      const staffPointAlias = staff.point.trim();
      const staffPointCode = staffPointAlias === 'alistore-center' || staffPointAlias === 'AliStore Центр'
        ? 'center'
        : staffPointAlias.toLowerCase();
      const staffPoint = await this.prisma.storePoint.findFirst({
        where: {
          active: true,
          OR: [
            { id: staffPointAlias },
            { code: staffPointCode },
            { inventoryLocation: staffPointAlias.toUpperCase() },
          ],
        },
        select: { id: true },
      });
      if (!staffPoint || staffPoint.id !== storePoint.id) {
        throw new ForbiddenError('staff_point_mismatch', 'Кассир не назначен на выбранную точку');
      }
    }
    const pct = dto.discountPct ?? 0;
    const txnId = this.deriveTxnId(dto);

    if (txnId) {
      const existing = await this.payments.findByTxnId(txnId);
      if (existing?.orderId) {
        // The replay check hashes the client-sent composition only (no catalog reads),
        // so a legitimate retry still replays after a later price change (LOGIC-006).
        const expectedTotal = saleTotal(dto.lines, pct);
        const expectedPayments = this.normalizePayments(dto, expectedTotal);
        return this.replaySale(existing, dto, storePoint.inventoryLocation, expectedTotal, expectedPayments);
      }
      const existingOrder = await this.prisma.order.findUnique({
        where: { idempotencyKey: txnId },
        select: { id: true, status: true, total: true, posShiftId: true },
      });
      if (existingOrder) {
        await this.assertReplayCompatible(existingOrder.id, dto);
        if (existingOrder.status === 'paid') {
          // Zero-total sales never create a Payment row, so the tender lookup above
          // misses them; a paid order whose lookup missed is still the same sale.
          const replay = await this.completedFromExistingPayment(existingOrder.id, existingOrder.posShiftId);
          return dto.clientSaleId ? replay : { ...replay, dedupedBy: 'fingerprint' as const };
        }
        if (existingOrder.status === 'created' || existingOrder.status === 'reserved') {
          // The first attempt died between order creation/reservation and the payment
          // batch (LOGIC-012): re-running the whole flow re-created nothing but died on
          // fulfill (`reserved→reserved` 422) or on stock resolution, because the units
          // are already held by this order. Resume at the step that failed instead.
          return this.resumeSale(existingOrder, dto, txnId, storePoint.inventoryLocation);
        }
        throw new ConflictError(
          'sale_key_burned',
          `Продажа по этому ключу уже ${existingOrder.status === 'cancelled' ? 'отменена' : `завершена (${existingOrder.status})`}; оформите заново с новым ключом`,
        );
      }
    }

    const items = await this.resolveOrderLines(dto, storePoint.inventoryLocation);
    const margin = this.evaluateMargin(items, pct);
    const total = margin.total;
    const payments = this.normalizePayments(dto, total);
    const discountApprovalNeeded = pct > APPROVAL_THRESHOLDS.discountPct;
    const marginApprovalNeeded = margin.breaches.length > 0;
    const approvalReason = this.approvalReason(discountApprovalNeeded, marginApprovalNeeded);

    // Discount or margin breach (Approval Rules Matrix): park the sale for approval.
    // The cashier re-submits with the approvalId once a senior role approves; only
    // then does the sale run. The fingerprint prevents reusing one approval for a
    // different product/cost/price mix with the same discount percentage.
    if (discountApprovalNeeded || marginApprovalNeeded) {
      if (!dto.approvalId) {
        const parked = await this.approvals.request({
          action: 'discount',
          requester: actor,
          reason: dto.reason ?? this.defaultApprovalMessage(approvalReason, pct, margin),
          payload: {
            staffId: dto.staffId,
            point: storePoint.inventoryLocation,
            discountPct: pct,
            gross: margin.gross,
            total: margin.total,
            lines: dto.lines.length,
            approvalReason,
            minMargin: margin.minMargin,
            worstMargin: margin.worstMargin,
            marginBreaches: margin.breaches,
            marginFingerprint: margin.fingerprint,
          },
        });
        return {
          pendingApproval: true as const,
          approvalId: parked.approvalId,
          discountPct: pct,
          reason: approvalReason,
          margin: {
            minMargin: margin.minMargin,
            worstMargin: margin.worstMargin,
            breaches: margin.breaches,
          },
        };
      }
      await this.assertDiscountApproved(dto.approvalId, pct, margin.fingerprint, marginApprovalNeeded);
    }

    const customer = await this.customers.upsert({
      phone: WALKIN_PHONE,
      name: 'Розничный покупатель',
    });

    let shift = await this.shifts.currentOpen(dto.staffId);
    if (!shift) {
      shift = await this.shifts.open(
        { staffId: dto.staffId, point: storePoint.inventoryLocation, openCash: 0 },
        actor,
      );
    }

    const orderItems = items.map(({ productId: _productId, unitCost: _unitCost, costRef: _costRef, ...item }) => item);
    const order = await this.orders.create(
      { customerId: customer.id, channel: 'pos', fulfillmentType: 'store', storePointId: storePoint.id, total, items: orderItems },
      actor,
      txnId,
      {
        subtotal: total,
        deliveryFee: 0,
        promoCode: null,
        promoDiscount: 0,
        loyaltyPoints: 0,
        unitCostsByLine: items.map((item) => item.unitCost),
        posShiftId: shift.id,
      },
      storePoint,
    );
    const containsBundle = await this.prisma.product.count({
      where: { sku: { in: items.map((item) => item.sku) }, bundleComponents: { some: {} } },
    });
    if (containsBundle > 0) {
      try {
        await this.orders.fulfill(order.id, actor);
        const expectedBundleImeis = items.flatMap((item) => bundleImeis(item.costRef));
        const allocations = await this.prisma.orderBundleAllocation.findMany({
          where: { orderId: order.id },
          select: { imei: true },
          orderBy: { imei: 'asc' },
        });
        const actualBundleImeis = allocations.map((allocation) => allocation.imei).sort();
        if (JSON.stringify(actualBundleImeis) !== JSON.stringify(expectedBundleImeis.sort())) {
          throw new ConflictError('bundle_inventory_changed', 'Состав набора изменился; повторите продажу и одобрение');
        }
      } catch (error) {
        const failedOrder = await this.prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
        if (failedOrder?.status === 'created' || failedOrder?.status === 'reserved') {
          await this.orders.transition(order.id, 'cancelled', actor);
        }
        throw error;
      }
    } else await this.orders.fulfill(order.id, actor);
    if (total === 0) {
      return {
        pendingApproval: false as const,
        orderId: order.id,
        receiptNo: `POS-${order.id.slice(-6).toUpperCase()}`,
        total,
        status: 'paid',
        shiftId: shift.id,
        imeis: items.filter((item) => item.imei).map((item) => item.imei as string),
      };
    }
    const paid = await this.payments.payMany(
      {
        orderId: order.id,
        shiftId: shift.id,
        payments: payments.map((payment, index) => ({
          ...payment,
          txnId: txnId ? (index === 0 ? txnId : `${txnId}:${index}`) : undefined,
        })),
      },
      actor,
      { staffId: dto.staffId },
    );

    return {
      pendingApproval: false as const,
      orderId: order.id,
      receiptNo: `POS-${order.id.slice(-6).toUpperCase()}`,
      total,
      status: paid.order?.status ?? 'paid',
      shiftId: shift.id,
      imeis: items.filter((i) => i.imei).map((i) => i.imei as string),
    };
  }

  /**
   * Resolve the idempotency key for a sale (M-5). A client-supplied `clientSaleId` is the
   * precise key; when absent, fall back to a windowed cart fingerprint so a retried
   * submission does not create a second order. Always returns a key so dedup never no-ops.
   */
  private deriveTxnId(dto: PosSaleDto): string {
    if (dto.clientSaleId) return `pos:${dto.clientSaleId}`;
    return `pos:auto:${this.saleFingerprint(dto)}`;
  }

  /**
   * Deterministic fingerprint of a cart for fallback idempotency: staff + point + the
   * normalized lines/tenders/discount, bucketed into a time window. Lines and tenders are
   * sorted so field order never changes the hash.
   */
  private saleFingerprint(dto: PosSaleDto): string {
    const bucket = Math.floor(Date.now() / POS_AUTO_DEDUP_WINDOW_MS);
    const lines = dto.lines
      .map((line) => `${line.sku}:${line.qty}:${line.price}`)
      .sort()
      .join('|');
    const tenders = (dto.payments ?? (dto.method ? [{ method: dto.method, amount: 0 }] : []))
      .map((payment) => `${payment.method}:${payment.amount}`)
      .sort()
      .join('|');
    const material = [dto.staffId, dto.point, dto.discountPct ?? 0, lines, tenders, bucket].join('#');
    return createHash('sha256').update(material).digest('hex').slice(0, 32);
  }

  /**
   * Verify a replayed idempotency key against the stored sale (LOGIC-006). The canonical
   * composition is already persisted as order items + payments, so — like the courier
   * command payload comparison — the stored sale is hashed the same way as the incoming
   * request; a mismatch means the key was reused for a different sale and conflicts
   * instead of returning someone else's receipt.
   */
  private async replaySale(
    existing: Payment,
    dto: PosSaleDto,
    point: string,
    total: number,
    payments: NormalizedPosPayment[],
  ) {
    const order = await this.orders.get(existing.orderId as string);
    if (!order) {
      throw new ValidationError('order_not_found', `Заказ ${existing.orderId} не найден`);
    }
    const storedHash = this.saleRequestHash({
      staffId: existing.receivedBy ?? '',
      point: existing.point ?? '',
      total: order.total,
      lines: order.items,
      tenders: order.payments.filter((payment) => payment.amount > 0),
    });
    const requestHash = this.saleRequestHash({
      staffId: dto.staffId ?? '',
      point,
      total,
      lines: dto.lines,
      tenders: payments,
    });
    if (storedHash !== requestHash) {
      throw new ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
    }
    const completed = await this.completedFromExistingPayment(order.id, existing.shiftId);
    // The fingerprint fallback is a last resort (M-5): an auto-keyed hit cannot be told
    // apart from a deliberate identical re-ring, so the dedup is flagged instead of
    // silently substituting the sale. A distinct same-cart sale needs its own clientSaleId.
    return dto.clientSaleId ? completed : { ...completed, dedupedBy: 'fingerprint' as const };
  }

  /**
   * SHA-256 over the canonical sale composition, mirroring the refunds requestHash
   * pattern. Lines are aggregated per sku+price (auto-assigned IMEI units are split into
   * per-unit rows server-side) and lines/tenders are sorted, so field order and unit
   * assignment never change the hash.
   */
  private saleRequestHash(composition: {
    staffId: string;
    point: string;
    total: number;
    lines: Array<{ sku: string; qty: number; price: number }>;
    tenders: Array<{ method: string; amount: number }>;
  }): string {
    const aggregated = new Map<string, { sku: string; qty: number; price: number }>();
    for (const line of composition.lines) {
      const key = `${line.sku}:${line.price}`;
      const existing = aggregated.get(key);
      if (existing) existing.qty += line.qty;
      else aggregated.set(key, { sku: line.sku, qty: line.qty, price: line.price });
    }
    const canonical = {
      staffId: composition.staffId,
      point: composition.point,
      total: composition.total,
      lines: [...aggregated.values()].map((line) => `${line.sku}:${line.qty}:${line.price}`).sort(),
      tenders: composition.tenders.map((tender) => `${tender.method}:${tender.amount}`).sort(),
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private normalizePayments(dto: PosSaleDto, total: number): NormalizedPosPayment[] {
    if (dto.payments?.length) {
      const paymentTotal = dto.payments.reduce((sum, payment) => sum + payment.amount, 0);
      if (paymentTotal !== total) {
        throw new ValidationError(
          'payment_split_mismatch',
          `Сумма split-платежей ${paymentTotal} должна равняться итогу ${total}`,
        );
      }
      return dto.payments.map((payment) => ({ method: payment.method, amount: payment.amount }));
    }

    if (!dto.method) {
      throw new ValidationError('payment_method_required', 'Укажите способ оплаты или split-платежи');
    }
    return [{ method: dto.method, amount: total }];
  }

  private evaluateMargin(items: OrderLine[], pct: number): MarginControlResult {
    return evaluateMarginControl(
      items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        qty: item.qty,
        price: item.price,
        cost: item.unitCost,
        costRef: item.costRef ?? item.imei,
      })),
      pct,
      APPROVAL_THRESHOLDS.minMarginSom,
    );
  }

  private async resolveOrderLines(dto: PosSaleDto, location: string): Promise<OrderLine[]> {
    const items: OrderLine[] = [];
    for (const line of dto.lines) {
      if (line.imei) {
        if (line.qty !== 1) throw new ValidationError('serialized_quantity_invalid', 'Строка с IMEI должна иметь количество 1');
        const selected = await this.units.getForSaleByImei(line.imei);
        if (selected.productId !== line.productId || selected.sku !== line.sku) {
          throw new ValidationError('imei_product_mismatch', `IMEI ${line.imei} не относится к ${line.sku}`);
        }
        if (line.price !== selected.price) {
          throw new ValidationError('product_price_mismatch', `Цена ${line.sku} изменилась: актуальная цена ${selected.price}`);
        }
        if (selected.status !== 'in_stock') throw new ConflictError('unit_not_available', `IMEI ${line.imei} недоступен (статус: ${selected.status})`);
        if (selected.location !== location) throw new ConflictError('unit_wrong_location', `IMEI ${line.imei} находится в другой точке`);
        items.push({ productId: line.productId, sku: line.sku, qty: 1, price: line.price, imei: line.imei, unitCost: selected.acquisitionCost ?? selected.productCost });
        continue;
      }
      const product = await this.prisma.product.findUnique({
        where: { id: line.productId },
        include: {
          _count: { select: { bundleComponents: true } },
          bundleComponents: {
            select: {
              qty: true,
              componentProductId: true,
              componentProduct: { select: { sku: true, cost: true, trackingMode: true } },
            },
          },
        },
      });
      if (!product || product.sku !== line.sku) throw new ValidationError('product_not_found', `Товар ${line.sku} не найден`);
      if (line.price !== product.price) throw new ValidationError('product_price_mismatch', `Цена ${line.sku} изменилась: актуальная цена ${product.price}`);
      if (product.trackingMode === 'quantity' || product._count.bundleComponents > 0) {
        if (product.bundleComponents.length === 0) {
          items.push({ productId: line.productId, sku: line.sku, qty: line.qty, price: line.price, unitCost: product.cost });
          continue;
        }
        const bundleCopies = Array.from({ length: line.qty }, () => ({ unitCost: 0, imeis: [] as string[] }));
        for (const component of product.bundleComponents) {
          if (component.componentProduct.trackingMode === 'quantity') {
            for (const copy of bundleCopies) copy.unitCost += component.qty * component.componentProduct.cost;
            continue;
          }
          const required = component.qty * line.qty;
          const units = await this.prisma.deviceUnit.findMany({
            where: { productId: component.componentProductId, status: 'in_stock', location, consignmentItem: { is: null } },
            take: required,
            orderBy: { id: 'asc' },
          });
          if (units.length < required) {
            throw new ConflictError('insufficient_bundle_stock', `Для набора ${line.sku} недостаточно ${component.componentProduct.sku}: нужно ${required}, в наличии ${units.length}`);
          }
          for (const [copyIndex, copy] of bundleCopies.entries()) {
            for (const unit of units.slice(copyIndex * component.qty, (copyIndex + 1) * component.qty)) {
              copy.unitCost += unit.acquisitionCost ?? component.componentProduct.cost;
              copy.imeis.push(unit.imei);
            }
          }
        }
        for (const copy of bundleCopies) {
          items.push({
            productId: line.productId,
            sku: line.sku,
            qty: 1,
            price: line.price,
            unitCost: copy.unitCost,
            costRef: copy.imeis.length > 0 ? `bundle:${copy.imeis.sort().join(',')}` : undefined,
          });
        }
        continue;
      }
      const available = await this.prisma.deviceUnit.findMany({
        where: { productId: line.productId, status: 'in_stock', location },
        take: line.qty,
        orderBy: { id: 'asc' },
      });
      if (available.length < line.qty) {
        throw new ConflictError('insufficient_stock', `Недостаточно единиц ${line.sku}: нужно ${line.qty}, в наличии ${available.length}`);
      }
      for (const unit of available) {
        items.push({ productId: line.productId, sku: line.sku, qty: 1, price: line.price, imei: unit.imei, unitCost: unit.acquisitionCost ?? product.cost });
      }
    }
    return items;
  }

  /** Verify a discount approval is approved and matches sale percentage and margin fingerprint. */
  private async assertDiscountApproved(
    approvalId: string,
    pct: number,
    marginFingerprint: string,
    requiresMarginApproval: boolean,
  ): Promise<void> {
    const approval = await this.approvals.get(approvalId);
    if (!approval || approval.action !== 'discount') {
      throw new ValidationError('discount_approval_not_found', 'Одобрение скидки не найдено');
    }
    if (approval.status !== 'approved') {
      throw new ForbiddenError('discount_not_approved', `Скидка ещё не одобрена (${approval.status})`);
    }
    const payload = (approval.evidence as {
      payload?: { discountPct?: number; marginFingerprint?: string };
    } | null)?.payload;
    const approvedPct = payload?.discountPct;
    if (approvedPct !== pct) {
      throw new ForbiddenError('discount_mismatch', `Одобрено ${approvedPct}%, применяется ${pct}%`);
    }
    if (requiresMarginApproval && payload?.marginFingerprint !== marginFingerprint) {
      throw new ForbiddenError('margin_mismatch', 'Одобрение маржи не совпадает с текущей продажей');
    }
    if (payload?.marginFingerprint && payload.marginFingerprint !== marginFingerprint) {
      throw new ForbiddenError('discount_mismatch', 'Одобрение скидки не совпадает с текущей продажей');
    }
  }

  private approvalReason(discountApprovalNeeded: boolean, marginApprovalNeeded: boolean) {
    if (discountApprovalNeeded && marginApprovalNeeded) return 'discount_and_margin';
    if (marginApprovalNeeded) return 'margin';
    return 'discount';
  }

  private defaultApprovalMessage(reason: string, pct: number, margin: MarginControlResult) {
    if (reason === 'margin') {
      return `Маржа ${margin.worstMargin} сом ниже лимита ${margin.minMargin} сом в POS`;
    }
    if (reason === 'discount_and_margin') {
      return `Скидка ${pct}% и маржа ${margin.worstMargin} сом ниже лимита ${margin.minMargin} сом в POS`;
    }
    return `Скидка ${pct}% в POS (> лимита ${APPROVAL_THRESHOLDS.discountPct}%)`;
  }

  private async completedFromExistingPayment(orderId: string, shiftId: string | null) {
    const order = await this.orders.get(orderId);
    if (!order) {
      throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
    }
    return {
      pendingApproval: false as const,
      orderId: order.id,
      receiptNo: `POS-${order.id.slice(-6).toUpperCase()}`,
      total: order.total,
      status: order.status,
      shiftId: shiftId ?? '',
      imeis: order.items.filter((i) => i.imei).map((i) => i.imei as string),
      idempotent: true,
    };
  }

  /**
   * Push a half-finished sale through (LOGIC-012). The first attempt committed the order
   * (and usually its stock reservation) but died before the payment batch committed, so
   * a retry with the same key resumes at the failed step instead of re-creating the
   * order: a `created` order is fulfilled now, a `reserved` one already holds its units
   * and goes straight to tenders. The tenders reuse the exact per-tender txnIds of the
   * original attempt, so a payment that did commit is replayed by PaymentsService rather
   * than charged twice; payMany also re-validates reservation coverage before flipping
   * the order to paid, so a reservation swept in the meantime fails closed.
   * The tender set itself is taken from the retry (a cashier may switch from a failed
   * terminal to cash); the key is still bound to staff + cart + total by
   * `assertReplayCompatible`.
   */
  private async resumeSale(
    existing: { id: string; total: number; posShiftId: string | null },
    dto: PosSaleDto,
    txnId: string,
    inventoryLocation: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: existing.id },
      select: { status: true },
    });
    if (order?.status === 'created') {
      // The first attempt died before (or inside) fulfillment: reserve the stock now.
      await this.orders.fulfill(existing.id, dto.staffId);
    } else if (order?.status !== 'reserved') {
      throw new ConflictError('sale_not_resumable', `Продажу в статусе ${order?.status ?? 'unknown'} нельзя дожать`);
    }
    if (existing.total === 0) {
      // A zero-total order flips to paid inside fulfill; no Payment row ever exists.
      return this.completedFromExistingPayment(existing.id, existing.posShiftId);
    }
    let shift = await this.shifts.currentOpen(dto.staffId);
    if (!shift) {
      shift = await this.shifts.open(
        { staffId: dto.staffId, point: inventoryLocation, openCash: 0 },
        dto.staffId,
      );
    }
    const tenders = this.normalizePayments(dto, existing.total);
    const paid = await this.payments.payMany(
      {
        orderId: existing.id,
        shiftId: shift.id,
        payments: tenders.map((payment, index) => ({
          ...payment,
          txnId: index === 0 ? txnId : `${txnId}:${index}`,
        })),
      },
      dto.staffId,
      { staffId: dto.staffId },
    );
    const completed = await this.orders.get(existing.id);
    if (!completed) {
      throw new ValidationError('order_not_found', `Заказ ${existing.id} не найден`);
    }
    return {
      pendingApproval: false as const,
      orderId: completed.id,
      receiptNo: `POS-${completed.id.slice(-6).toUpperCase()}`,
      total: completed.total,
      status: paid.order?.status ?? completed.status,
      shiftId: shift.id,
      imeis: completed.items.filter((item) => item.imei).map((item) => item.imei as string),
      resumed: true as const,
    };
  }

  /** Never return a receipt for a different cart or another cashier's key. */
  private async assertReplayCompatible(orderId: string, dto: PosSaleDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        total: true,
        items: { select: { sku: true, qty: true, price: true }, orderBy: { lineNumber: 'asc' } },
        posShift: { select: { staffId: true } },
      },
    });
    if (!order) throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
    if (order.posShift?.staffId && order.posShift.staffId !== dto.staffId) {
      throw new ConflictError('idempotency_key_reused', 'Ключ продажи уже принадлежит другому кассиру');
    }
    // Serialized units are split into per-unit rows server-side, so both sides are
    // aggregated per sku+price (mirroring saleRequestHash) before comparison.
    const aggregate = (lines: Array<{ sku: string; qty: number; price: number }>) => {
      const bySkuPrice = new Map<string, { sku: string; qty: number; price: number }>();
      for (const line of lines) {
        const key = `${line.sku}:${line.price}`;
        const seen = bySkuPrice.get(key);
        if (seen) seen.qty += line.qty;
        else bySkuPrice.set(key, { sku: line.sku, qty: line.qty, price: line.price });
      }
      return [...bySkuPrice.values()]
        .map((line) => `${line.sku}:${line.qty}:${line.price}`)
        .sort()
        .join('|');
    };
    if (aggregate(dto.lines) !== aggregate(order.items)) {
      throw new ConflictError('idempotency_key_reused', 'Ключ продажи уже связан с другим составом корзины');
    }
    // The discount percentage is part of the composition: the stored total must equal
    // what this request would charge, or the key is being reused for different money.
    if (saleTotal(dto.lines, dto.discountPct ?? 0) !== order.total) {
      throw new ConflictError('idempotency_key_reused', 'Ключ продажи уже связан с другой суммой');
    }
  }
}

function bundleImeis(costRef?: string): string[] {
  return costRef?.startsWith('bundle:') ? costRef.slice('bundle:'.length).split(',').filter(Boolean) : [];
}
