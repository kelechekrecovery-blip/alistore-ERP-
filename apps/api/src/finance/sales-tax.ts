import { ValidationError } from '../common/errors';

const TAX_SCALE = 10_000;
const DB_INT_MAX = 2_147_483_647;

export type TaxClassification = {
  taxCode: string;
  taxRateBps: number;
};

export type TaxableLine = TaxClassification & {
  lineNumber: number;
  grossAmount: number;
};

export type TaxLineSnapshot = TaxableLine & {
  discountAmount: number;
  taxBaseAmount: number;
  taxAmount: number;
};

export function salesTaxSnapshot(lines: TaxableLine[], finalMerchandiseAmount: number) {
  if (lines.length === 0) throw new ValidationError('sales_tax_lines_required', 'Для расчёта налога нужны позиции продажи');
  const ordered = [...lines].sort((left, right) => left.lineNumber - right.lineNumber);
  const grossAmount = ordered.reduce((sum, line) => sum + line.grossAmount, 0);
  if (!Number.isSafeInteger(finalMerchandiseAmount) || finalMerchandiseAmount < 0 || finalMerchandiseAmount > grossAmount) {
    throw new ValidationError('sales_tax_consideration_invalid', 'Итоговая стоимость товаров не совпадает с первичными позициями');
  }
  const discountAmount = grossAmount - finalMerchandiseAmount;
  let cumulativeGross = 0;
  let allocatedDiscount = 0;
  const snapshots = ordered.map((line, index) => {
    assertTaxClassification(line);
    if (!Number.isSafeInteger(line.grossAmount) || line.grossAmount < 0) {
      throw new ValidationError('sales_tax_line_amount_invalid', 'Сумма позиции должна быть целым неотрицательным числом');
    }
    cumulativeGross += line.grossAmount;
    const targetDiscount = index === ordered.length - 1
      ? discountAmount
      : floorRatio(discountAmount, cumulativeGross, grossAmount || 1);
    const lineDiscount = targetDiscount - allocatedDiscount;
    allocatedDiscount = targetDiscount;
    const taxableGross = line.grossAmount - lineDiscount;
    const taxAmount = includedTax(taxableGross, line.taxRateBps);
    return {
      ...line,
      taxCode: line.taxCode.trim(),
      discountAmount: lineDiscount,
      taxBaseAmount: taxableGross - taxAmount,
      taxAmount,
    };
  });
  const taxAmount = snapshots.reduce((sum, line) => sum + line.taxAmount, 0);
  const taxBaseAmount = snapshots.reduce((sum, line) => sum + line.taxBaseAmount, 0);
  return { grossAmount, discountAmount, taxBaseAmount, taxAmount, lines: snapshots };
}

export function includedTax(grossAmount: number, taxRateBps: number) {
  if (!Number.isSafeInteger(grossAmount) || grossAmount < 0) {
    throw new ValidationError('sales_tax_amount_invalid', 'Сумма для расчёта налога некорректна');
  }
  assertTaxClassification({ taxCode: taxRateBps === 0 ? 'none' : 'taxable', taxRateBps });
  if (grossAmount === 0 || taxRateBps === 0) return 0;
  return roundedRatio(grossAmount, taxRateBps, TAX_SCALE + taxRateBps);
}

/**
 * Allocates a document-level tax total over multiple receipts or refunds.
 * The cumulative target makes the last movement absorb rounding and guarantees
 * that N split tenders still post exactly one document tax total.
 */
export function cumulativeTaxDelta(totalTax: number, documentTotal: number, processedBefore: number, movementAmount: number) {
  for (const value of [totalTax, documentTotal, processedBefore, movementAmount]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ValidationError('sales_tax_allocation_invalid', 'Параметры распределения налога некорректны');
    }
  }
  if (documentTotal === 0) return 0;
  if (totalTax > documentTotal || processedBefore + movementAmount > documentTotal) {
    throw new ValidationError('sales_tax_allocation_exceeded', 'Распределение налога превышает сумму первичного документа');
  }
  const before = floorRatio(totalTax, processedBefore, documentTotal);
  const after = processedBefore + movementAmount === documentTotal
    ? totalTax
    : floorRatio(totalTax, processedBefore + movementAmount, documentTotal);
  return after - before;
}

export function outputTaxMetadata(lines: Array<TaxClassification & { taxAmount: number }>) {
  const taxable = lines.filter((line) => line.taxAmount > 0);
  if (taxable.length === 0) return { taxCode: 'none', taxRateBps: 0 };
  const codes = new Set(taxable.map((line) => line.taxCode));
  const rates = new Set(taxable.map((line) => line.taxRateBps));
  return {
    taxCode: codes.size === 1 && rates.size === 1 ? `vat_output:${taxable[0].taxCode}` : 'vat_output:mixed',
    taxRateBps: rates.size === 1 ? taxable[0].taxRateBps : 0,
  };
}

export function assertTaxClassification(input: TaxClassification) {
  if (!input.taxCode.trim() || input.taxCode.length > 64) {
    throw new ValidationError('sales_tax_code_invalid', 'Налоговый код должен содержать от 1 до 64 символов');
  }
  if (!Number.isSafeInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > TAX_SCALE) {
    throw new ValidationError('sales_tax_rate_invalid', 'Ставка налога должна быть от 0 до 10000 базисных пунктов');
  }
}

function floorRatio(value: number, numerator: number, denominator: number) {
  if (value === 0 || numerator === 0) return 0;
  const result = Number(BigInt(value) * BigInt(numerator) / BigInt(denominator));
  if (!Number.isSafeInteger(result) || result > DB_INT_MAX) {
    throw new ValidationError('sales_tax_amount_overflow', 'Сумма налога превышает допустимый диапазон');
  }
  return result;
}

function roundedRatio(value: number, numerator: number, denominator: number) {
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const result = Number((product + divisor / 2n) / divisor);
  if (!Number.isSafeInteger(result) || result > DB_INT_MAX) {
    throw new ValidationError('sales_tax_amount_overflow', 'Сумма налога превышает допустимый диапазон');
  }
  return result;
}
