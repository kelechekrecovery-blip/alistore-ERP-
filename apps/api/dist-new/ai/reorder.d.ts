export type ReorderUrgency = 'high' | 'medium' | 'low' | 'none';
export interface ReorderInput {
    inStock: number;
    reserved: number;
    soldUnits: number;
}
export interface ReorderRec {
    needsReorder: boolean;
    urgency: ReorderUrgency;
    suggestedQty: number;
    reason: string;
}
export declare function suggestReorder(input: ReorderInput): ReorderRec;
