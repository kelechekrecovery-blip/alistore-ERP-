import type { Customer, Prisma } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { ValidationError } from '../common/errors';

export const DELETED_CUSTOMER_PHONE_PREFIX = 'deleted:';

export class CustomerSessionRevokedException extends UnauthorizedException {
  readonly code = 'customer_session_revoked';

  constructor() {
    super('customer_session_revoked');
  }
}

export function isActiveCustomerPhone(phone: string): boolean {
  return !phone.startsWith(DELETED_CUSTOMER_PHONE_PREFIX);
}

export function deletedCustomerPhone(customerId: string): string {
  return `${DELETED_CUSTOMER_PHONE_PREFIX}${customerId}`;
}

/**
 * Authoritative transaction fence shared by credential issuance and every
 * customer-scoped mutation that must not cross account deletion.
 */
export async function lockActiveCustomerOnTx(
  tx: Prisma.TransactionClient,
  customerId: string,
  errorCode = 'customer_session_revoked',
): Promise<Customer> {
  await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer || !isActiveCustomerPhone(customer.phone)) {
    if (errorCode === 'customer_session_revoked') {
      throw new CustomerSessionRevokedException();
    }
    throw new ValidationError(errorCode, 'Сессия клиента отозвана');
  }
  return customer;
}
