import { CatalogProductForMatch, SupplierPriceImportMapping, SupplierPriceImportRow, SupplierPriceImportSummary } from './supplier-price-import.types';
interface RawRow {
    rowNumber: number;
    sku: string;
    barcode: string | null;
    cost: number | null;
    leadDays: number | null;
    error: string | null;
}
export declare function parseMoney(raw: unknown): {
    value: number;
} | {
    error: string;
};
export declare function parseLeadDays(raw: unknown): {
    value: number | null;
} | {
    error: string;
};
export declare function parseSupplierPriceList(buffer: Buffer, mapping: SupplierPriceImportMapping): Promise<RawRow[]>;
export declare function classifySupplierPriceRows(rawRows: RawRow[], products: CatalogProductForMatch[], supplierId: string): {
    rows: SupplierPriceImportRow[];
    summary: SupplierPriceImportSummary;
};
export {};
