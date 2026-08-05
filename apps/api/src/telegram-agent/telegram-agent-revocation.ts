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
  const identities = await tx.telegramAgentIdentity.findMany({
    where: subject.staffId ? { staffId: subject.staffId } : { customerId: subject.customerId },
  });
  for (const identity of identities) {
    // Serializes revocation with the final authorization check in reply().
    await tx.$queryRaw`SELECT id FROM "TelegramAgentIdentity" WHERE id = ${identity.id} FOR UPDATE`;
    const revokedRecipient = `revoked:${identity.id}`;
    const redactedPayload = { redacted: true, reason };
    const queued = await tx.outboxMessage.findMany({
      where: {
        channel: 'telegram',
        recipient: identity.chatId,
        template: 'telegram_agent_reply',
        status: { in: ['pending', 'failed', 'sent'] },
      },
      select: { id: true, status: true, payload: true },
    });
    for (const message of queued) {
      const payload = message.payload;
      const payloadBot = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).botId
        : undefined;
      if (payloadBot && payloadBot !== identity.botId) continue;
      await tx.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: message.status === 'sent' ? 'sent' : 'cancelled',
          recipient: revokedRecipient,
          payload: redactedPayload,
          nextAttemptAt: null,
          lastError: reason,
        },
      });
    }
    await tx.telegramAgentMessage.deleteMany({
      where: {
        OR: [
          { identityId: identity.id },
          { botId: identity.botId, telegramUserId: identity.telegramUserId },
        ],
      },
    });
    if (deleteIdentity) {
      await tx.telegramAgentIdentity.delete({ where: { id: identity.id } });
    } else {
      await tx.telegramAgentIdentity.update({ where: { id: identity.id }, data: { active: false } });
    }
  }
}
