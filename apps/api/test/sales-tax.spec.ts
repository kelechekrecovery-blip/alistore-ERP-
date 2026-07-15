import { cumulativeTaxDelta, includedTax, outputTaxMetadata, salesTaxSnapshot } from '../src/finance/sales-tax';

describe('sales tax snapshots', () => {
  it('allocates discounts over mixed-tax lines and keeps document totals exact', () => {
    const result = salesTaxSnapshot([
      { lineNumber: 1, grossAmount: 100_000, taxCode: 'vat_standard', taxRateBps: 1200 },
      { lineNumber: 2, grossAmount: 20_000, taxCode: 'vat_exempt', taxRateBps: 0 },
    ], 108_000);

    expect(result).toMatchObject({ grossAmount: 120_000, discountAmount: 12_000 });
    expect(result.lines.map((line) => line.discountAmount)).toEqual([10_000, 2_000]);
    expect(result.taxBaseAmount + result.taxAmount).toBe(108_000);
    expect(result.taxAmount).toBe(includedTax(90_000, 1200));
  });

  it('posts one exact VAT total across split tenders and partial refunds', () => {
    const tax = includedTax(112_000, 1200);
    const receipts = [
      cumulativeTaxDelta(tax, 112_000, 0, 50_000),
      cumulativeTaxDelta(tax, 112_000, 50_000, 62_000),
    ];
    const refunds = [
      cumulativeTaxDelta(tax, 112_000, 0, 30_000),
      cumulativeTaxDelta(tax, 112_000, 30_000, 82_000),
    ];
    expect(receipts.reduce((sum, value) => sum + value, 0)).toBe(tax);
    expect(refunds.reduce((sum, value) => sum + value, 0)).toBe(tax);
  });

  it('marks a mixed-rate document without inventing a blended legal rate', () => {
    expect(outputTaxMetadata([
      { taxCode: 'vat_standard', taxRateBps: 1200, taxAmount: 100 },
      { taxCode: 'vat_reduced', taxRateBps: 400, taxAmount: 10 },
    ])).toEqual({ taxCode: 'vat_output:mixed', taxRateBps: 0 });
  });
});
