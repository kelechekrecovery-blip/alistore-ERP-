import { Prisma } from '@prisma/client';
import { OutboxService } from './outbox.service';
import { OutboxChannel } from './outbox.types';

export interface CustomerNoticeInput {
  customerId: string;
  template: string;
  payload?: Record<string, unknown>;
  channel?: OutboxChannel;
}

/**
 * Enqueue a customer notification only when the customer has opted in. Kept as a
 * small helper so transactional producers stay consistent and consent-filtered.
 */
export async function enqueueConsentedCustomerNotice(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  input: CustomerNoticeInput,
): Promise<boolean> {
  const customer = await tx.customer.findUnique({
    where: { id: input.customerId },
    select: { phone: true, consent: true },
  });
  if (!customer?.phone || !customer.consent) return false;

  await outbox.enqueueOnTx(tx, {
    channel: input.channel ?? 'sms',
    recipient: customer.phone,
    template: input.template,
    payload: { customerId: input.customerId, ...(input.payload ?? {}) },
  });
  return true;
}
