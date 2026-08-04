import { Prisma } from '@prisma/client';

type TelegramAgentSubject =
  | { staffId: string; customerId?: never }
  | { customerId: string; staffId?: never };

/**
 * Revokes a Telegram link and erases queued reply PII in the caller's lifecycle
 * transaction. Reactivating a staff account never reactivates this link: a new
 * TOTP-gated pairing code is required.
 */
export async function revokeTelegramAgentAccessOnTx(
  tx: Prisma.TransactionClient,
  subject: TelegramAgentSubject,
  reason: string,
  deleteIdentity = false,
): Promise<void> {
  if (subject.staffId) {
    await tx.telegramAgentPairing.deleteMany({
      where: { staffId: subject.staffId, usedAt: null },
    });
  }
  const identity = subject.staffId
    ? await tx.telegramAgentIdentity.findUnique({ where: { staffId: subject.staffId } })
    : await tx.telegramAgentIdentity.findUnique({ where: { customerId: subject.customerId } });
  if (!identity) return;

  // Serializes revocation with the final authorization check in reply().
  await tx.$queryRaw`SELECT id FROM "TelegramAgentIdentity" WHERE id = ${identity.id} FOR UPDATE`;
  const revokedRecipient = `revoked:${identity.id}`;
  const redactedPayload = { redacted: true, reason };
  await tx.outboxMessage.updateMany({
    where: {
      channel: 'telegram',
      recipient: identity.chatId,
      template: 'telegram_agent_reply',
      status: { in: ['pending', 'failed'] },
    },
    data: {
      status: 'cancelled',
      recipient: revokedRecipient,
      payload: redactedPayload,
      nextAttemptAt: null,
      lastError: reason,
    },
  });
  await tx.outboxMessage.updateMany({
    where: {
      channel: 'telegram',
      recipient: identity.chatId,
      template: 'telegram_agent_reply',
      status: 'sent',
    },
    data: {
      recipient: revokedRecipient,
      payload: redactedPayload,
    },
  });
  await tx.telegramAgentMessage.deleteMany({
    where: {
      OR: [
        { identityId: identity.id },
        { telegramUserId: identity.telegramUserId },
      ],
    },
  });
  if (deleteIdentity) {
    await tx.telegramAgentIdentity.delete({ where: { id: identity.id } });
  } else {
    await tx.telegramAgentIdentity.update({
      where: { id: identity.id },
      data: { active: false },
    });
  }
}
