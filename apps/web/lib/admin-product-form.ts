import type { AdminProduct } from '@/lib/api';

/** Editable string-backed shape of the admin product form (raw inputs before parsing). */
export interface ProductForm {
  sku: string;
  barcode: string;
  variantGroup: string;
  bundleText: string;
  name: string;
  price: string;
  cost: string;
  category: string;
  taxCode: string;
  taxRateBps: string;
  trackingMode: 'serialized' | 'quantity';
  attrsText: string;
}

export const emptyForm: ProductForm = {
  sku: '',
  barcode: '',
  variantGroup: '',
  bundleText: '',
  name: '',
  price: '',
  cost: '',
  category: '',
  taxCode: 'vat_standard',
  taxRateBps: '1200',
  trackingMode: 'serialized',
  attrsText: '{\n  "description": ""\n}',
};

export const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#8A7F76]';
export const inputCls =
  'w-full rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime';
export const mutedButtonCls =
  'rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm font-semibold text-[#D8CFC6] transition hover:border-[#3A342E] disabled:cursor-not-allowed disabled:text-[#6E645C]';

export function attrsToText(attrs: AdminProduct['attrs'] | undefined): string {
  return JSON.stringify(attrs && typeof attrs === 'object' ? attrs : {}, null, 2);
}

export function formFromProduct(product: AdminProduct): ProductForm {
  return {
    sku: product.sku,
    barcode: product.barcode ?? '',
    variantGroup: product.variantGroup ?? '',
    bundleText: product.bundleComponents.map((component) => `${component.sku} × ${component.qty}`).join('\n'),
    name: product.name,
    price: String(product.price),
    cost: String(product.cost),
    category: product.category,
    taxCode: product.taxCode,
    taxRateBps: String(product.taxRateBps),
    trackingMode: product.trackingMode,
    attrsText: attrsToText(product.attrs),
  };
}

export function parseAttrs(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Attrs должен быть JSON-объектом');
  }
  return parsed as Record<string, unknown>;
}

export function parseSom(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label}: укажите целое число >= 0`);
  }
  return parsed;
}

export function parseBasisPoints(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error('Ставка налога: укажите целое число от 0 до 10000 bps');
  }
  return parsed;
}

export function parseBundleComponents(text: string): Array<{ sku: string; qty: number }> {
  if (!text.trim()) return [];
  return text.split('\n').filter((line) => line.trim()).map((line) => {
    const match = line.trim().match(/^(.+?)\s*(?:×|x|:)\s*(\d+)$/i);
    if (!match) throw new Error(`Состав набора: используйте формат SKU × 1 (${line.trim()})`);
    const qty = Number(match[2]);
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Количество компонента должно быть >= 1');
    return { sku: match[1].trim(), qty };
  });
}

export function productMargin(product: AdminProduct): number {
  if (product.price <= 0) return 0;
  return Math.round(((product.price - product.cost) / product.price) * 100);
}
