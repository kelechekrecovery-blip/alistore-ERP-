import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { UpsertCustomerDto } from './customers.dto';
import { buildCustomerOverview, CustomerOverview } from './customer-overview';
import { warrantyCoverage } from './warranty-coverage';

/**
 * Customers for storefront/guest checkout. Phone is the natural key (unique), so
 * find-or-create is idempotent — repeat checkouts from the same phone reuse the
 * customer instead of duplicating. PII (phone) is masked for junior roles at the
 * read layer; that lands with auth/roles.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  /**
   * Toggle marketing consent (Notification Preferences). Idempotent — writes the
   * customer.consent_changed ledger event only when the value actually flips, so the
   * audit trail records real consent decisions (withdrawal must stop all campaigns).
   */
  async setConsent(customerId: string, consent: boolean, actor: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
    }
    return this.audit.transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id: customerId }, data: { consent } });
      const events =
        customer.consent === consent
          ? []
          : [
              {
                type: EventType.ConsentChanged,
                actor,
                payload: { customerId, from: customer.consent, to: consent },
                refs: [customerId],
              },
            ];
      return { result: updated, events };
    });
  }

  /** Find-or-create by phone; updates the name only when a new one is provided. */
  async upsert(dto: UpsertCustomerDto) {
    return this.prisma.customer.upsert({
      where: { phone: dto.phone },
      update: dto.name ? { name: dto.name } : {},
      create: { phone: dto.phone, name: dto.name ?? 'Клиент' },
    });
  }

  /**
   * Devices the customer bought — the serialized units (IMEI) sold on their orders,
   * with the product name and any open warranty case. Powers «Мои устройства».
   */
  async devices(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      select: { id: true, createdAt: true },
    });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length === 0) return [];
    const purchasedAt = new Map(orders.map((o) => [o.id, o.createdAt]));

    const [units, warranties] = await Promise.all([
      this.prisma.deviceUnit.findMany({
        where: { orderId: { in: orderIds }, status: { in: ['sold', 'returned', 'in_repair'] } },
        include: { product: { select: { name: true } } },
      }),
      this.prisma.warrantyCase.findMany({ where: { customerId } }),
    ]);

    return units.map((u) => {
      const cover = warrantyCoverage(u.orderId ? purchasedAt.get(u.orderId) : undefined);
      return {
        imei: u.imei,
        product: u.product.name,
        status: u.status,
        warrantyUntil: cover?.until.toISOString() ?? null,
        daysLeft: cover?.daysLeft ?? null,
        warranty: warranties.find((w) => w.imei === u.imei) ?? null,
      };
    });
  }

  /**
   * Customer 360 — one read that folds the customer's orders, spend, debts,
   * warranties and support tickets together. Read-only; every figure is derived
   * from the underlying tables (Event-Ledger-first), never a stored aggregate.
   */
  async overview(customerId: string): Promise<CustomerOverview> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
    }
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    const orderIds = orders.map((o) => o.id);
    const [payments, debts, warranties, tickets] = await Promise.all([
      orderIds.length
        ? this.prisma.payment.findMany({
            where: { orderId: { in: orderIds } },
            select: { amount: true, status: true },
          })
        : Promise.resolve([]),
      this.prisma.debtPlan.findMany({ where: { customerId }, orderBy: { dueDate: 'asc' } }),
      this.prisma.warrantyCase.findMany({ where: { customerId }, orderBy: { sla: 'asc' } }),
      this.prisma.supportTicket.findMany({ where: { customerId }, orderBy: { sla: 'asc' } }),
    ]);
    return buildCustomerOverview({ customer, orders, payments, debts, warranties, tickets });
  }
}
