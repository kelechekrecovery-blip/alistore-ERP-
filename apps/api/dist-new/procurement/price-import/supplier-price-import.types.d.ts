export interface SupplierPriceImportMapping {
    sku: string;
    price: string;
    leadDays?: string;
    barcode?: string;
}
export type SupplierPriceImportRowType = 'invalid' | 'unmatched' | 'ambiguous' | 'no_change' | 'price_change' | 'lead_time_change';
export type SupplierPriceImportChangedField = 'cost' | 'supplyLeadDays' | 'supplierId';
export interface SupplierPriceImportRow {
    rowNumber: number;
    sku: string;
    barcode: string | null;
    type: SupplierPriceImportRowType;
    error: string | null;
    matchedProductId: string | null;
    matchedSku: string | null;
    changedFields: SupplierPriceImportChangedField[];
    oldCost: number | null;
    newCost: number | null;
    deltaCost: number | null;
    oldLeadDays: number | null;
    newLeadDays: number | null;
    oldSupplierId: string | null;
    newSupplierId: string | null;
}
export interface SupplierPriceImportSummary {
    total: number;
    invalid: number;
    unmatched: number;
    ambiguous: number;
    noChange: number;
    priceChange: number;
    leadTimeChange: number;
}
export interface CatalogProductForMatch {
    id: string;
    sku: string;
    barcode: string | null;
    cost: number;
    supplyLeadDays: number | null;
    supplierId: string | null;
}
