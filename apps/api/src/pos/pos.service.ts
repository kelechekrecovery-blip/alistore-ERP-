import { Injectable } from '@nestjs/common';
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
import { evaluateMarginControl, MarginControlResult } from './margin-control';

/** Walk-in retail customer — POS sales without a named buyer attach here. */
const WALKIN_PHONE = '+000000000000';

/**
 * Fallback POS idempotency window (M-5). Real clients (web/mobile) always send a
 * `clientSaleId`, which is the precise idempotency key. If one is missing, we derive a
 * deterministic key from the cart fingerprint bucketed into this window, so an accidental
 * network re-submit within the window collapses to one sale while a deliberate identical
 * re-ring in a later window is still processed as a new sale.
 */
const POS_AUTO_DEDUP_WINDOW_MS = 60_000;

interface OrderLine {
  sku: string;
  qty: number;
  price: number;
  imei?: string;
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
 * Each step is atomic on its own; the reservation-expiry sweep reclaims stock if a
 * later step fails, so a half-finished sale never strands a unit.
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
        return this.completedFromExistingPayment(existing.orderId, existing.shiftId);
      }
    }

    const margin = await this.evaluateMargin(dto, pct);
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

    // Serialized products require concrete units; quantity products reserve balances later.
    const items: OrderLine[] = [];
    for (const line of dto.lines) {
      if (line.imei) {
        if (line.qty !== 1) {
          throw new ValidationError('serialized_quantity_invalid', 'Строка с IMEI должна иметь количество 1');
        }
        const selected = await this.units.getByImei(line.imei);
        if (selected.productId !== line.productId || selected.sku !== line.sku) {
          throw new ValidationError('imei_product_mismatch', `IMEI ${line.imei} не относится к ${line.sku}`);
        }
        if (selected.status !== 'in_stock') {
          throw new ConflictError('unit_not_available', `IMEI ${line.imei} недоступен (статус: ${selected.status})`);
        }
        if (selected.location !== storePoint.inventoryLocation) {
          throw new ConflictError('unit_wrong_location', `IMEI ${line.imei} находится в другой точке`);
        }
        items.push({ sku: line.sku, qty: 1, price: line.price, imei: line.imei });
        continue;
      }
      const product = await this.prisma.product.findUnique({
        where: { id: line.productId },
        include: { _count: { select: { bundleComponents: true } } },
      });
      if (!product || product.sku !== line.sku) {
        throw new ValidationError('product_not_found', `Товар ${line.sku} не найден`);
      }
      if (product.trackingMode === 'quantity' || product._count.bundleComponents > 0) {
        items.push({ sku: line.sku, qty: line.qty, price: line.price });
        continue;
      }
      const available = await this.prisma.deviceUnit.findMany({
        where: { productId: line.productId, status: 'in_stock', location: storePoint.inventoryLocation },
        take: line.qty,
        orderBy: { id: 'asc' },
      });
      if (available.length >= line.qty) {
        for (const unit of available.slice(0, line.qty)) {
          items.push({ sku: line.sku, qty: 1, price: line.price, imei: unit.imei });
        }
      } else {
        throw new ConflictError(
          'insufficient_stock',
          `Недостаточно единиц ${line.sku}: нужно ${line.qty}, в наличии ${available.length}`,
        );
      }
    }

    const order = await this.orders.create(
      { customerId: customer.id, channel: 'pos', fulfillmentType: 'store', storePointId: storePoint.id, total, items },
      actor,
      undefined,
      undefined,
      storePoint,
    );
    const containsBundle = await this.prisma.product.count({
      where: { sku: { in: items.map((item) => item.sku) }, bundleComponents: { some: {} } },
    });
    if (containsBundle > 0) await this.orders.fulfill(order.id, actor);
    else await this.orders.reserve(order.id, actor);
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

  private async evaluateMargin(dto: PosSaleDto, pct: number): Promise<MarginControlResult> {
    const productIds = [...new Set(dto.lines.map((line) => line.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        sku: true,
        price: true,
        cost: true,
        bundleComponents: {
          select: { qty: true, componentProduct: { select: { cost: true } } },
        },
      },
    });
    const catalog = new Map(products.map((product) => [product.id, product]));
    const missing = productIds.find((id) => !catalog.has(id));
    if (missing) {
      throw new ValidationError('product_not_found', `Товар ${missing} не найден`);
    }
    for (const line of dto.lines) {
      const product = catalog.get(line.productId)!;
      if (line.sku !== product.sku) {
        throw new ValidationError('product_sku_mismatch', `SKU товара ${line.productId} изменился`);
      }
      if (line.price !== product.price) {
        throw new ValidationError(
          'product_price_mismatch',
          `Цена ${line.sku} изменилась: актуальная цена ${product.price}`,
        );
      }
    }
    return evaluateMarginControl(
      dto.lines.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        qty: line.qty,
        price: line.price,
        cost: (() => {
          const product = catalog.get(line.productId);
          if (!product) return 0;
          return product.bundleComponents.length > 0
            ? product.bundleComponents.reduce(
                (sum, component) => sum + component.qty * component.componentProduct.cost,
                0,
              )
            : product.cost;
        })(),
      })),
      pct,
      APPROVAL_THRESHOLDS.minMarginSom,
    );
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
}
