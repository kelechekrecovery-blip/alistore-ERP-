export interface MarginControlLine {
  productId: string;
  sku: string;
  qty: number;
  price: number;
  cost: number;
  costRef?: string;
}

export interface MarginBreach {
  productId: string;
  sku: string;
  qty: number;
  price: number;
  cost: number;
  discountedPrice: number;
  margin: number;
  minMargin: number;
}

export interface MarginControlResult {
  gross: number;
  total: number;
  discountAmount: number;
  minMargin: number;
  worstMargin: number;
  breaches: MarginBreach[];
  fingerprint: string;
}

/** Sale total after the percentage discount; pure, so the POS replay check reuses it. */
export function saleTotal(lines: Array<{ price: number; qty: number }>, discountPct: number): number {
  const gross = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  return Math.round(gross * (1 - discountPct / 100));
}

export function evaluateMarginControl(
  lines: MarginControlLine[],
  discountPct: number,
  minMargin: number,
): MarginControlResult {
  const gross = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const total = saleTotal(lines, discountPct);
  const discountAmount = gross - total;
  const margins = lines.map((line) => Math.round(line.price * (1 - discountPct / 100)) - line.cost);
  const worstMargin = margins.length ? Math.min(...margins) : 0;
  const breaches = lines
    .map((line, index) => {
      const discountedPrice = Math.round(line.price * (1 - discountPct / 100));
      const margin = margins[index] ?? 0;
      return { line, discountedPrice, margin };
    })
    .filter(({ margin }) => margin < minMargin)
    .map(({ line, discountedPrice, margin }) => ({
      productId: line.productId,
      sku: line.sku,
      qty: line.qty,
      price: line.price,
      cost: line.cost,
      discountedPrice,
      margin,
      minMargin,
    }));

  return {
    gross,
    total,
    discountAmount,
    minMargin,
    worstMargin,
    breaches,
    fingerprint: marginFingerprint(lines, discountPct, minMargin),
  };
}

function marginFingerprint(lines: MarginControlLine[], discountPct: number, minMargin: number): string {
  const normalized = lines
    .map((line) => ({
      productId: line.productId,
      sku: line.sku,
      qty: line.qty,
      price: line.price,
      cost: line.cost,
      costRef: line.costRef ?? null,
    }))
    .sort((a, b) =>
      `${a.productId}:${a.sku}:${a.price}:${a.qty}:${a.cost}:${a.costRef}`.localeCompare(
        `${b.productId}:${b.sku}:${b.price}:${b.qty}:${b.cost}:${b.costRef}`,
      ),
    );
  return JSON.stringify({ discountPct, minMargin, lines: normalized });
}
