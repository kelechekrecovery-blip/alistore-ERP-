export interface DescribeInput {
  name: string;
  category?: string;
  attrs?: Record<string, unknown>;
}

/** How the copy was produced — a rule template or a live LLM. */
export type DescriptionSource = 'template' | string;

export interface ProductDescription {
  description: string;
  source: DescriptionSource;
  highlights: string[]; // the spec bullets used
}

/** Attribute keys that read well in a customer-facing blurb (RU/EN), in priority order. */
const HIGHLIGHT_KEYS = [
  'память',
  'memory',
  'storage',
  'озу',
  'ram',
  'экран',
  'display',
  'screen',
  'цвет',
  'color',
  'процессор',
  'chip',
  'cpu',
  'камера',
  'camera',
  'аккумулятор',
  'battery',
];

const isScalar = (v: unknown): v is string | number =>
  typeof v === 'string' || typeof v === 'number';

/** LLM prompt for a marketing description — used by the OpenRouter provider path. */
export function buildDescriptionMessages(input: DescribeInput): { role: 'system' | 'user'; content: string }[] {
  const system = [
    'Ты — копирайтер магазина электроники в Кыргызстане. Напиши краткое продающее описание',
    'товара на русском (2–3 предложения, без markdown, без выдуманных характеристик —',
    'только на основе переданных данных). Не указывай цену.',
  ].join(' ');
  const payload = { name: input.name, category: input.category ?? null, attrs: input.attrs ?? {} };
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Данные товара (JSON):\n${JSON.stringify(payload)}` },
  ];
}

/**
 * Keyless product description (Phase 11) — a readable Russian blurb assembled from the
 * name, category and the most sale-relevant attributes. Deterministic; the LLM provider
 * replaces this behind the same call when a key is set, and it stays the fallback.
 */
export function buildDescription(input: DescribeInput): ProductDescription {
  const attrs = input.attrs ?? {};
  const highlights: string[] = [];

  // Prefer known sale-relevant keys, in order; then top up with any other scalar attrs.
  for (const key of HIGHLIGHT_KEYS) {
    const hit = Object.keys(attrs).find((k) => k.toLowerCase() === key);
    if (hit && isScalar(attrs[hit]) && !highlights.some((h) => h.startsWith(`${hit}:`))) {
      highlights.push(`${hit}: ${attrs[hit]}`);
    }
    if (highlights.length >= 4) break;
  }
  if (highlights.length < 4) {
    for (const [k, v] of Object.entries(attrs)) {
      if (highlights.length >= 4) break;
      if (isScalar(v) && !highlights.some((h) => h.startsWith(`${k}:`))) highlights.push(`${k}: ${v}`);
    }
  }

  const catPart = input.category ? ` из категории «${input.category}»` : '';
  const specPart = highlights.length ? ` Ключевые характеристики — ${highlights.join(', ')}.` : '';
  const description =
    `${input.name}${catPart} — доступен в AliStore.${specPart} ` +
    'Гарантия 12 месяцев, доставка по Бишкеку за 1–2 часа и самовывоз в день заказа.';

  return { description, source: 'template', highlights };
}
