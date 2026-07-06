import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCustomerDto } from './customers.dto';

/**
 * Customers for storefront/guest checkout. Phone is the natural key (unique), so
 * find-or-create is idempotent — repeat checkouts from the same phone reuse the
 * customer instead of duplicating. PII (phone) is masked for junior roles at the
 * read layer; that lands with auth/roles.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  get(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
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
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length === 0) return [];

    const [units, warranties] = await Promise.all([
      this.prisma.deviceUnit.findMany({
        where: { orderId: { in: orderIds }, status: { in: ['sold', 'returned', 'in_repair'] } },
        include: { product: { select: { name: true } } },
      }),
      this.prisma.warrantyCase.findMany({ where: { customerId } }),
    ]);

    return units.map((u) => ({
      imei: u.imei,
      product: u.product.name,
      status: u.status,
      warranty: warranties.find((w) => w.imei === u.imei) ?? null,
    }));
  }
}
