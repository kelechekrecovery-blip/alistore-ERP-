"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReorderDraft = buildReorderDraft;
function buildReorderDraft(input) {
    if (!input.idempotencyKey.trim())
        throw new Error('reorder_draft_idempotency_required');
    if (!input.supplierId.trim())
        throw new Error('reorder_draft_supplier_required');
    if (!input.location.trim())
        throw new Error('reorder_draft_location_required');
    const items = input.reviews
        .filter((review) => review.needsReorder)
        .map((review) => {
        const unitCost = input.unitCosts[review.productId];
        if (!Number.isInteger(unitCost) || unitCost < 0) {
            throw new Error(`reorder_unit_cost_required:${review.sku}`);
        }
        if (!Number.isInteger(review.suggestedQty) || review.suggestedQty < 1) {
            throw new Error(`reorder_quantity_invalid:${review.sku}`);
        }
        return { productId: review.productId, qty: review.suggestedQty, unitCost };
    });
    if (items.length === 0)
        throw new Error('reorder_draft_empty');
    return {
        idempotencyKey: input.idempotencyKey,
        supplierId: input.supplierId,
        location: input.location,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        items,
    };
}
//# sourceMappingURL=reorder-draft.js.map