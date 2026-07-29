import { Workbook } from 'exceljs';
import { ValidationError } from '../../common/errors';
import {
  CatalogProductForMatch,
  SupplierPriceImportChangedField,
  SupplierPriceImportMapping,
  SupplierPriceImportRow,
  SupplierPriceImportSummary,
} from './supplier-price-import.types';

const LEAD_DAYS_MIN = 1;
const LEAD_DAYS_MAX = 180;

interface RawRow {
  rowNumber: number;
  sku: string;
  barcode: string | null;
  cost: number | null;
  leadDays: number | null;
  error: string | null;
}

function cell(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * Money is Int minor units everywhere in this codebase (whole som, no
 * fractional currency tracked) — a supplier cell like "12 500,50" is
 * rejected outright rather than silently rounded. Thousand-separator spaces
 * (incl. the non-breaking space Excel sometimes emits) and a comma decimal
 * separator are normalised first so a clean whole number like "12 500"
 * still parses.
 */
export function parseMoney(raw: unknown): { value: number } | { error: string } {
  const str = cell(raw).replace(/[\s ]/g, '').replace(',', '.');
  if (!str) return { error: 'price_required' };
  const n = Number(str);
  if (!Number.isFinite(n)) return { error: 'invalid_price' };
  if (n <= 0) return { error: 'invalid_price' };
  if (!Number.isInteger(n)) return { error: 'non_integer_price' };
  return { value: n };
}

export function parseLeadDays(raw: unknown): { value: number | null } | { error: string } {
  const str = cell(raw);
  if (!str) return { value: null };
  const n = Number(str.replace(',', '.'));
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { error: 'invalid_lead_days' };
  if (n < LEAD_DAYS_MIN || n > LEAD_DAYS_MAX) return { error: 'lead_days_out_of_range' };
  return { value: n };
}

/** Parse the workbook into raw rows — no catalog lookups yet. */
export async function parseSupplierPriceList(
  buffer: Buffer,
  mapping: SupplierPriceImportMapping,
): Promise<RawRow[]> {
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) throw new ValidationError('empty_workbook', 'Пустой файл');

  const headerIndex: Record<string, number> = {};
  ws.getRow(1).eachCell((c, colNumber) => {
    const header = cell(c.value).toLowerCase();
    if (header) headerIndex[header] = colNumber;
  });

  const skuCol = headerIndex[mapping.sku.trim().toLowerCase()];
  const priceCol = headerIndex[mapping.price.trim().toLowerCase()];
  const leadDaysCol = mapping.leadDays ? headerIndex[mapping.leadDays.trim().toLowerCase()] : undefined;
  const barcodeCol = mapping.barcode ? headerIndex[mapping.barcode.trim().toLowerCase()] : undefined;

  if (!skuCol || !priceCol) {
    throw new ValidationError(
      'mapping_columns_not_found',
      `Колонки из mapping не найдены в файле: ${!skuCol ? mapping.sku : ''} ${!priceCol ? mapping.price : ''}`.trim(),
    );
  }

  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const sku = cell(row.getCell(skuCol).value);
    const priceRaw = row.getCell(priceCol).value;
    if (!sku && (priceRaw === null || priceRaw === undefined || priceRaw === '')) continue; // blank line

    if (!sku) {
      rows.push({ rowNumber: r, sku: '', barcode: null, cost: null, leadDays: null, error: 'sku_required' });
      continue;
    }
    const price = parseMoney(priceRaw);
    if ('error' in price) {
      rows.push({ rowNumber: r, sku, barcode: null, cost: null, leadDays: null, error: price.error });
      continue;
    }
    let leadDays: number | null = null;
    if (leadDaysCol) {
      const parsed = parseLeadDays(row.getCell(leadDaysCol).value);
      if ('error' in parsed) {
        rows.push({ rowNumber: r, sku, barcode: null, cost: null, leadDays: null, error: parsed.error });
        continue;
      }
      leadDays = parsed.value;
    }
    const barcode = barcodeCol ? cell(row.getCell(barcodeCol).value) || null : null;
    rows.push({ rowNumber: r, sku, barcode, cost: price.value, leadDays, error: null });
  }
  return rows;
}

/**
 * Match + diff raw rows against the current catalog, and classify each one.
 * SKU is matched first, then barcode — never by name (a human resolves the
 * rest). A SKU claimed by more than one row in the same file (duplicate rows,
 * or one row matching by SKU while another matches the same product by
 * barcode) is ambiguous for all of the rows that claim it — applying either
 * one silently would guess which is authoritative.
 */
export function classifySupplierPriceRows(
  rawRows: RawRow[],
  products: CatalogProductForMatch[],
  supplierId: string,
): { rows: SupplierPriceImportRow[]; summary: SupplierPriceImportSummary } {
  const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
  const byBarcode = new Map(
    products.filter((p) => p.barcode).map((p) => [p.barcode!.toLowerCase(), p]),
  );

  const matches = rawRows.map((raw) => {
    if (raw.error) return { raw, product: null as CatalogProductForMatch | null };
    const bySkuHit = bySku.get(raw.sku.toLowerCase());
    const product = bySkuHit ?? (raw.barcode ? byBarcode.get(raw.barcode.toLowerCase()) ?? null : null);
    return { raw, product };
  });

  const claimCount = new Map<string, number>();
  for (const m of matches) {
    if (!m.product) continue;
    claimCount.set(m.product.id, (claimCount.get(m.product.id) ?? 0) + 1);
  }

  const rows: SupplierPriceImportRow[] = matches.map(({ raw, product }) => {
    if (raw.error) {
      return blankRow(raw, 'invalid', raw.error);
    }
    if (!product) {
      return blankRow(raw, 'unmatched', null);
    }
    if ((claimCount.get(product.id) ?? 0) > 1) {
      return {
        ...blankRow(raw, 'ambiguous', null),
        matchedProductId: product.id,
        matchedSku: product.sku,
      };
    }

    const changedFields: SupplierPriceImportChangedField[] = [];
    if (raw.cost !== null && raw.cost !== product.cost) changedFields.push('cost');
    if (raw.leadDays !== null && raw.leadDays !== product.supplyLeadDays) changedFields.push('supplyLeadDays');

    const type = changedFields.includes('cost')
      ? 'price_change'
      : changedFields.includes('supplyLeadDays')
        ? 'lead_time_change'
        : 'no_change';

    // Attaching the supplier link is a side effect of an actual update, not
    // its own preview category (the plan enumerates new/unmatched/ambiguous/
    // price/lead-time only) — a row that changes nothing else does not touch
    // the product at all, supplier link included.
    if (type !== 'no_change' && product.supplierId !== supplierId) {
      changedFields.push('supplierId');
    }

    return {
      rowNumber: raw.rowNumber,
      sku: raw.sku,
      barcode: raw.barcode,
      type,
      error: null,
      matchedProductId: product.id,
      matchedSku: product.sku,
      changedFields,
      oldCost: product.cost,
      newCost: raw.cost,
      deltaCost: raw.cost !== null ? raw.cost - product.cost : null,
      oldLeadDays: product.supplyLeadDays,
      newLeadDays: raw.leadDays,
      oldSupplierId: product.supplierId,
      newSupplierId: type !== 'no_change' ? supplierId : product.supplierId,
    };
  });

  const summary: SupplierPriceImportSummary = {
    total: rows.length,
    invalid: rows.filter((r) => r.type === 'invalid').length,
    unmatched: rows.filter((r) => r.type === 'unmatched').length,
    ambiguous: rows.filter((r) => r.type === 'ambiguous').length,
    noChange: rows.filter((r) => r.type === 'no_change').length,
    priceChange: rows.filter((r) => r.type === 'price_change').length,
    leadTimeChange: rows.filter((r) => r.type === 'lead_time_change').length,
  };

  return { rows, summary };
}

function blankRow(
  raw: RawRow,
  type: 'invalid' | 'unmatched' | 'ambiguous',
  error: string | null,
): SupplierPriceImportRow {
  return {
    rowNumber: raw.rowNumber,
    sku: raw.sku,
    barcode: raw.barcode,
    type,
    error,
    matchedProductId: null,
    matchedSku: null,
    changedFields: [],
    oldCost: null,
    newCost: raw.cost,
    deltaCost: null,
    oldLeadDays: null,
    newLeadDays: raw.leadDays,
    oldSupplierId: null,
    newSupplierId: null,
  };
}
