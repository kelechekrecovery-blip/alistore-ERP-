import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError, ValidationError } from '../common/errors';
import { postCogsOnTx } from '../inventory/inventory-valuation';

/**
 * DeviceUnit (IMEI/SN) lifecycle. Enforces the hard invariant:
 *   «Нельзя продать один IMEI дважды» — a unit moves in_stock → reserved → sold,
 *   and a sold unit can never be reserved or sold again (409).
 *
 * The reserve/sell operations take a transaction client so they compose inside a
 * single Order/Payment transaction together with the ledger event.
 */
@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Available (in_stock) units for a product, oldest first — POS unit assignment. */
  listAvailable(productId: string, limit: number) {
    return this.prisma.deviceUnit.findMany({
      where: { productId, status: 'in_stock' },
      take: limit,
      orderBy: { id: 'asc' },
    });
  }

  /** Look up a unit by IMEI with its product — powers the cashier exchange lookup. */
  async getByImei(imei: string) {
    const unit = await this.prisma.deviceUnit.findUnique({
      where: { imei },
      include: { product: { select: { name: true, sku: true, price: true } } },
    });
    if (!unit) {
      throw new ValidationError('unit_not_found', `IMEI ${imei} не найден`);
    }
    return {
      imei: unit.imei,
      productId: unit.productId,
      status: unit.status,
      location: unit.location,
      orderId: unit.orderId,
      product: unit.product.name,
      sku: unit.product.sku,
      price: unit.product.price,
    };
  }

  /** Internal POS lookup; acquisition cost is deliberately not exposed by UnitsController. */
  async getForSaleByImei(imei: string) {
    const unit = await this.prisma.deviceUnit.findUnique({
      where: { imei },
      include: { product: { select: { name: true, sku: true, price: true, cost: true } } },
    });
    if (!unit) throw new ValidationError('unit_not_found', `IMEI ${imei} не найден`);
    return {
      imei: unit.imei,
      productId: unit.productId,
      status: unit.status,
      location: unit.location,
      orderId: unit.orderId,
      product: unit.product.name,
      sku: unit.product.sku,
      price: unit.product.price,
      acquisitionCost: unit.acquisitionCost,
      productCost: unit.product.cost,
    };
  }

  /** Приёмка партии — register a new physical unit (status in_stock). */
  async receive(input: {
    imei: string;
    productId: string;
    location: string;
    grade?: 'A' | 'B' | 'C';
  }) {
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      select: { cost: true },
    });
    if (!product) throw new ValidationError('product_not_found', `Товар ${input.productId} не найден`);
    return this.prisma.deviceUnit.create({
      data: {
        imei: input.imei,
        productId: input.productId,
        location: input.location,
        grade: input.grade,
        status: 'in_stock',
        acquisitionCost: product.cost,
      },
    });
  }

  /**
   * Reserve a unit for an order inside an existing transaction.
   * Only an in_stock unit can be reserved; anything else (reserved/sold/…) → 409.
   */
  async reserveOnTx(
    tx: Prisma.TransactionClient,
    imei: string,
    orderId: string,
  ): Promise<void> {
    // Conditional update = atomic guard: under Read Committed the UPDATE re-checks
    // status on the locked row, so two concurrent reservations of the same IMEI
    // cannot both flip in_stock→reserved (invariant #2). A findUnique→update would
    // let both pass the check and double-reserve (one device → two customers).
    const candidate = await tx.deviceUnit.findUnique({
      where: { imei },
      select: {
        acquisitionCost: true,
        product: { select: { cost: true } },
        consignmentItem: { select: { id: true } },
      },
    });
    const acquisitionCost = candidate?.consignmentItem
      ? candidate.acquisitionCost
      : candidate?.acquisitionCost ?? candidate?.product.cost;
    const { count } = await tx.deviceUnit.updateMany({
      where: { imei, status: 'in_stock' },
      data: { status: 'reserved', orderId, acquisitionCost },
    });
    if (count === 0) {
      const unit = await tx.deviceUnit.findUnique({ where: { imei } });
      if (!unit) {
        throw new ValidationError('unit_not_found', `IMEI ${imei} не найден`);
      }
      throw new ConflictError(
        'unit_not_available',
        `IMEI ${imei} недоступен для резерва (статус: ${unit.status})`,
      );
    }
  }

  /**
   * Sell a reserved unit inside an existing transaction.
   * A sold unit is rejected (409) — the double-sale guard. The unit must be
   * reserved by THIS order.
   */
  async sellOnTx(
    tx: Prisma.TransactionClient,
    imei: string,
    orderId: string,
    actor = 'system',
  ) {
    const { count } = await tx.deviceUnit.updateMany({
      where: { imei, status: 'reserved', orderId },
      data: { status: 'sold' },
    });
    if (count === 0) {
      const unit = await tx.deviceUnit.findUnique({ where: { imei } });
      if (!unit) {
        throw new ValidationError('unit_not_found', `IMEI ${imei} не найден`);
      }
      if (unit.status === 'sold') {
        throw new ConflictError('unit_already_sold', `IMEI ${imei} уже продан`);
      }
      throw new ConflictError(
        'unit_not_reserved_for_order',
        `IMEI ${imei} не зарезервирован под заказ ${orderId}`,
      );
    }
    const sold = await tx.deviceUnit.findUniqueOrThrow({
      where: { imei },
      include: {
        consignmentItem: { select: { id: true } },
      },
    });
    if (sold.consignmentItem) return null;
    if (sold.acquisitionCost === null) {
      throw new ConflictError('unit_acquisition_cost_missing', `Для IMEI ${imei} не зафиксирована себестоимость`);
    }
    return postCogsOnTx(tx, {
      productId: sold.productId,
      orderId,
      sourceRef: `${orderId}:${imei}`,
      imei,
      location: sold.location,
      quantity: 1,
      unitCost: sold.acquisitionCost,
      actor,
    });
  }

  /**
   * Release a unit's reservation inside an existing transaction: a unit still
   * `reserved` for THIS order returns to `in_stock` (orderId cleared). Used by the
   * reservation-expiry sweep (invariant #7).
   *
   * Idempotent and defensive — returns false without touching anything if the
   * unit was already sold, re-reserved by another order, or is no longer held by
   * this order, so an expired hold never disturbs a legitimately progressed unit.
   */
  async releaseOnTx(
    tx: Prisma.TransactionClient,
    imei: string,
    orderId: string,
  ): Promise<boolean> {
    // Conditional update — only releases a unit still reserved for THIS order,
    // atomically. Returns whether it actually freed one.
    const { count } = await tx.deviceUnit.updateMany({
      where: { imei, status: 'reserved', orderId },
      data: { status: 'in_stock', orderId: null },
    });
    return count > 0;
  }
}
