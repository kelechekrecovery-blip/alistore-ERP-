"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMoney = parseMoney;
exports.parseLeadDays = parseLeadDays;
exports.parseSupplierPriceList = parseSupplierPriceList;
exports.classifySupplierPriceRows = classifySupplierPriceRows;
const exceljs_1 = require("exceljs");
const errors_1 = require("../../common/errors");
const LEAD_DAYS_MIN = 1;
const LEAD_DAYS_MAX = 180;
function cell(value) {
    return value === null || value === undefined ? '' : String(value).trim();
}
function parseMoney(raw) {
    const str = cell(raw).replace(/[\s ]/g, '').replace(',', '.');
    if (!str)
        return { error: 'price_required' };
    const n = Number(str);
    if (!Number.isFinite(n))
        return { error: 'invalid_price' };
    if (n <= 0)
        return { error: 'invalid_price' };
    if (!Number.isInteger(n))
        return { error: 'non_integer_price' };
    return { value: n };
}
function parseLeadDays(raw) {
    const str = cell(raw);
    if (!str)
        return { value: null };
    const n = Number(str.replace(',', '.'));
    if (!Number.isFinite(n) || !Number.isInteger(n))
        return { error: 'invalid_lead_days' };
    if (n < LEAD_DAYS_MIN || n > LEAD_DAYS_MAX)
        return { error: 'lead_days_out_of_range' };
    return { value: n };
}
async function parseSupplierPriceList(buffer, mapping) {
    const wb = new exceljs_1.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws)
        throw new errors_1.ValidationError('empty_workbook', 'Пустой файл');
    const headerIndex = {};
    ws.getRow(1).eachCell((c, colNumber) => {
        const header = cell(c.value).toLowerCase();
        if (header)
            headerIndex[header] = colNumber;
    });
    const skuCol = headerIndex[mapping.sku.trim().toLowerCase()];
    const priceCol = headerIndex[mapping.price.trim().toLowerCase()];
    const leadDaysCol = mapping.leadDays ? headerIndex[mapping.leadDays.trim().toLowerCase()] : undefined;
    const barcodeCol = mapping.barcode ? headerIndex[mapping.barcode.trim().toLowerCase()] : undefined;
    if (!skuCol || !priceCol) {
        throw new errors_1.ValidationError('mapping_columns_not_found', `Колонки из mapping не найдены в файле: ${!skuCol ? mapping.sku : ''} ${!priceCol ? mapping.price : ''}`.trim());
    }
    const rows = [];
    for (let r = 2; r <= ws.rowCount; r += 1) {
        const row = ws.getRow(r);
        const sku = cell(row.getCell(skuCol).value);
        const priceRaw = row.getCell(priceCol).value;
        if (!sku && (priceRaw === null || priceRaw === undefined || priceRaw === ''))
            continue;
        if (!sku) {
            rows.push({ rowNumber: r, sku: '', barcode: null, cost: null, leadDays: null, error: 'sku_required' });
            continue;
        }
        const price = parseMoney(priceRaw);
        if ('error' in price) {
            rows.push({ rowNumber: r, sku, barcode: null, cost: null, leadDays: null, error: price.error });
            continue;
        }
        let leadDays = null;
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
function classifySupplierPriceRows(rawRows, products, supplierId) {
    const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
    const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode.toLowerCase(), p]));
    const matches = rawRows.map((raw) => {
        if (raw.error)
            return { raw, product: null };
        const bySkuHit = bySku.get(raw.sku.toLowerCase());
        const product = bySkuHit ?? (raw.barcode ? byBarcode.get(raw.barcode.toLowerCase()) ?? null : null);
        return { raw, product };
    });
    const claimCount = new Map();
    for (const m of matches) {
        if (!m.product)
            continue;
        claimCount.set(m.product.id, (claimCount.get(m.product.id) ?? 0) + 1);
    }
    const rows = matches.map(({ raw, product }) => {
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
        const changedFields = [];
        if (raw.cost !== null && raw.cost !== product.cost)
            changedFields.push('cost');
        if (raw.leadDays !== null && raw.leadDays !== product.supplyLeadDays)
            changedFields.push('supplyLeadDays');
        const type = changedFields.includes('cost')
            ? 'price_change'
            : changedFields.includes('supplyLeadDays')
                ? 'lead_time_change'
                : 'no_change';
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
    const summary = {
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
function blankRow(raw, type, error) {
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
//# sourceMappingURL=supplier-price-import.parser.js.map