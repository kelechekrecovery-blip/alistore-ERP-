/**
 * Потолок на то, сколько данных уходит в модель за один вызов инструмента.
 *
 * Агентный ассистент крутит до семи обращений подряд, и КАЖДЫЙ результат
 * инструмента остаётся в переписке — то есть входной контекст растёт
 * квадратично. При этом `get_pricing_review` и `get_reorder_review` возвращали
 * рекомендацию по каждому неархивному товару целиком и уходили в модель
 * как есть. На каталоге в несколько тысяч SKU это мегабайты JSON на итерацию,
 * а зовётся это на каждом открытии кокпита ERP.
 *
 * Обрезаем по числу элементов и по символам, и ГОВОРИМ модели, что список
 * усечён: молчаливая обрезка хуже — модель сделает вывод «дефицита нет»,
 * увидев пустой хвост.
 */

export const DEFAULT_TOOL_MAX_ITEMS = 40;
export const DEFAULT_TOOL_MAX_CHARS = 12_000;

export interface ToolBudget {
  maxItems?: number;
  maxChars?: number;
}

/**
 * Сериализует результат инструмента с ограничением объёма.
 *
 * Массивы (в том числе вложенные в объект первого уровня) режутся до
 * `maxItems`, рядом добавляется пометка об усечении. Итоговая строка жёстко
 * ограничена `maxChars` — последний рубеж на случай, когда объёмны сами
 * элементы, а не их количество.
 */
export function serializeToolResult(value: unknown, budget: ToolBudget = {}): string {
  const maxItems = budget.maxItems ?? DEFAULT_TOOL_MAX_ITEMS;
  const maxChars = budget.maxChars ?? DEFAULT_TOOL_MAX_CHARS;
  const json = JSON.stringify(capArrays(value, maxItems) ?? null);
  if (json.length <= maxChars) return json;
  return `${json.slice(0, maxChars)}… [ОБРЕЗАНО: ответ инструмента превысил ${maxChars} символов]`;
}

function capArrays(value: unknown, maxItems: number): unknown {
  if (Array.isArray(value)) return capArray(value, maxItems);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = Array.isArray(item) ? capArray(item, maxItems) : item;
    }
    return out;
  }
  return value;
}

function capArray(items: unknown[], maxItems: number): unknown[] {
  if (items.length <= maxItems) return items;
  return [
    ...items.slice(0, maxItems),
    { truncated: true, shown: maxItems, total: items.length,
      note: 'Список усечён. Не делай выводов о полноте — запроси уточнение у человека.' },
  ];
}
