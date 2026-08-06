"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishStorefrontRevisionOnTx = publishStorefrontRevisionOnTx;
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
async function publishStorefrontRevisionOnTx(tx, revisionId, actor, events) {
    await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext('storefront-content-publish'))`;
    const revision = await tx.storefrontContentRevision.findUnique({ where: { id: revisionId } });
    if (!revision)
        throw new errors_1.ValidationError('storefront_revision_not_found', 'Ревизия витрины не найдена');
    if (revision.status === 'published')
        return revision;
    if (revision.status !== 'draft')
        throw new errors_1.ConflictError('storefront_revision_not_draft', 'Опубликовать можно только черновик');
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
        type: event_types_1.EventType.StorefrontContentPublished,
        actor,
        payload: { revisionId, version: published.version },
        refs: [revisionId],
    });
    return published;
}
//# sourceMappingURL=storefront-publish.js.map