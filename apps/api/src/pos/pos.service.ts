import { Injectable } from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { ShiftsService } from '../shifts/shifts.service';
import { UnitsService } from '../units/units.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { ConflictError } from '../common/errors';
import { PosSaleDto } from './pos.dto';

/** Walk-in retail customer — POS sales without a named buyer attach here. */
const WALKIN_PHONE = '+000000000000';

interface OrderLine {
  sku: string;
  qty: number;
  price: number;
  imei?: string;
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
    private readonly customers: CustomersService,
    private readonly shifts: ShiftsService,
    private readonly units: UnitsService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  async sale(dto: PosSaleDto) {
    const actor = dto.staffId;

    const customer = await this.customers.upsert({
      phone: WALKIN_PHONE,
      name: 'Розничный покупатель',
    });

    let shift = await this.shifts.currentOpen(dto.staffId);
    if (!shift) {
      shift = await this.shifts.open(
        { staffId: dto.staffId, point: dto.point, openCash: 0 },
        actor,
      );
    }

    // Assign concrete IMEI units per line; accessories (no units) sell as plain lines.
    const items: OrderLine[] = [];
    let gross = 0;
    for (const line of dto.lines) {
      gross += line.price * line.qty;
      const available = await this.units.listAvailable(line.productId, line.qty);
      if (available.length >= line.qty) {
        for (const unit of available.slice(0, line.qty)) {
          items.push({ sku: line.sku, qty: 1, price: line.price, imei: unit.imei });
        }
      } else if (available.length === 0) {
        items.push({ sku: line.sku, qty: line.qty, price: line.price });
      } else {
        throw new ConflictError(
          'insufficient_stock',
          `Недостаточно единиц ${line.sku}: нужно ${line.qty}, в наличии ${available.length}`,
        );
      }
    }

    const pct = dto.discountPct ?? 0;
    const total = Math.round(gross * (1 - pct / 100));

    const order = await this.orders.create(
      { customerId: customer.id, channel: 'pos', total, items },
      actor,
    );
    await this.orders.reserve(order.id, actor);
    const paid = await this.payments.pay(
      { orderId: order.id, method: dto.method, amount: total, shiftId: shift.id },
      actor,
    );

    return {
      orderId: order.id,
      receiptNo: `POS-${order.id.slice(-6).toUpperCase()}`,
      total,
      status: paid.order?.status ?? 'paid',
      shiftId: shift.id,
      imeis: items.filter((i) => i.imei).map((i) => i.imei as string),
    };
  }
}
