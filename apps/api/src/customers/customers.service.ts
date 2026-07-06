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
}
