import type { ReorderReview } from './reorder.service';
export interface ReorderDraftInput {
    idempotencyKey: string;
    supplierId: string;
    location: string;
    reviews: Pick<ReorderReview, 'productId' | 'sku' | 'needsReorder' | 'suggestedQty'>[];
    unitCosts: Record<string, number>;
    note?: string;
}
export interface ReorderDraftPayload {
    idempotencyKey: string;
    supplierId: string;
    location: string;
    note?: string;
    items: {
        productId: string;
        qty: number;
        unitCost: number;
    }[];
}
export declare function buildReorderDraft(input: ReorderDraftInput): ReorderDraftPayload;
