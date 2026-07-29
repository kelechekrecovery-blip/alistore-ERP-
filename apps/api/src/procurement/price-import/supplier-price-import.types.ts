/**
 * Column mapping is data, not code: different suppliers name their columns
 * differently, so the mapping travels with the batch and is reused on the
 * supplier's next file when omitted. Values are the exact header text as it
 * appears in row 1 of the sheet (matched case-insensitively, trimmed).
 */
export interface SupplierPriceImportMapping {
  sku: string;
  price: string;
  leadDays?: string;
  barcode?: string;
}

export type SupplierPriceImportRowType =
  | 'invalid'
  | 'unmatched'
  | 'ambiguous'
  | 'no_change'
  | 'price_change'
  | 'lead_time_change';

export type SupplierPriceImportChangedField = 'cost' | 'supplyLeadDays' | 'supplierId';

/**
 * One classified row, computed once at stage time and persisted verbatim.
 * `apply` replays these exact values — it never re-parses the file or
 * re-diffs against a possibly-changed catalog, so preview and apply cannot
 * disagree.
 */
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
