import { Prisma } from '@prisma/client';

/**
 * Account deletion keeps a Customer tombstone so accounting relations remain
 * intact. A tombstone is never an authenticatable customer, even while an
 * access JWT signed before deletion has not reached its cryptographic expiry.
 */
export function isActiveCustomer(
  customer: { phone: string | null } | null | undefined,
): customer is { phone: string | null } {
  return Boolean(customer && !customer.phone?.startsWith('deleted:'));
}

/** One database-wide lock namespace for deletion, refresh and factor changes. */
export function customerAuthLockKey(customerId: string): string {
  return `customer-auth:${customerId}`;
}

/**
 * Opt in to an intentional refresh-token revocation inside the current
 * transaction. A database trigger rejects the previous binary's unsafe broad
 * replay UPDATE once exact token families exist; all new scoped/account-wide
 * revocations must declare intent explicitly.
 */
export async function authorizeRefreshTokenRevocation(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
): Promise<void> {
  await tx.$queryRaw`
    SELECT set_config('alistore.allow_refresh_revocation', 'on', true) AS configured
  `;
}
