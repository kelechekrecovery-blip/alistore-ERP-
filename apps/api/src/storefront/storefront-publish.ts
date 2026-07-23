import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';

/**
 * Publish a storefront revision inside a caller-owned transaction.
 *
 * Extracted from `StorefrontService.publish` so the four-eyes approval executor
 * can run it on the approval's transaction — the service method opens its own
 * `audit.transaction`, and nesting one inside the approval's would break
 * atomicity. Same shape as `insertDebt` / `applyCampaignRefundOnTx`.
 */
export async function publishStorefrontRevisionOnTx(
  tx: Prisma.TransactionClient,
  revisionId: string,
  actor: string,
  events: AuditInput[],
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('storefront-content-publish'))`;
  const revision = await tx.storefrontContentRevision.findUnique({ where: { id: revisionId } });
  if (!revision) throw new ValidationError('storefront_revision_not_found', 'Ревизия витрины не найдена');
  if (revision.status === 'published') return revision;
  if (revision.status !== 'draft') throw new ConflictError('storefront_revision_not_draft', 'Опубликовать можно только черновик');
  await tx.storefrontContentRevision.updateMany({
    where: {
      OR: [
        { status: 'published' },
        { status: 'scheduled', startsAt: { lte: new Date() } },
      ],
    },
    data: { status: 'archived' },
  });
  const published = await tx.storefrontContentRevision.update({
    where: { id: revisionId },
    data: {
      status: 'published',
      publishedBy: actor,
      publishedAt: new Date(),
      scheduledBy: null,
      startsAt: null,
      endsAt: null,
    },
  });
  events.push({
    type: EventType.StorefrontContentPublished,
    actor,
    payload: { revisionId, version: published.version },
    refs: [revisionId],
  });
  return published;
}
