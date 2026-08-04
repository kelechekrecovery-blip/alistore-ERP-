const nf = new Intl.NumberFormat('ru-RU');

/** Format сом amounts (integer minor-unit-free сом). */
export function som(value: number): string {
  return `${nf.format(value)} сом`;
}

/** Derive a human condition label from product attrs (новое / Б/У). */
export function conditionLabel(attrs: Record<string, unknown> | null): string {
  const grade = attrs?.['grade'] ?? attrs?.['condition'];
  if (grade === 'used' || grade === 'B' || grade === 'C') return 'Б/У';
  return 'Новое';
}

/** Correct Russian plural form of "день" for a count of days (1 день / 2 дня / 5 дней). */
function dayWord(days: number): string {
  const lastTwo = days % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней';
  switch (days % 10) {
    case 1:
      return 'день';
    case 2:
    case 3:
    case 4:
      return 'дня';
    default:
      return 'дней';
  }
}

/** "N дней" without the "Под заказ" prefix — for sentences that build their own lead-in. */
export function daysLabel(days: number): string {
  return `${days} ${dayWord(days)}`;
}

/**
 * Склонение «товар» по числу: 1 товар / 2 товара / 5 товаров.
 *
 * Счётчик в каталоге писал «товаров» при любом числе, и на четырёх позициях
 * заголовок читался как «4 товаров». Правило то же, что у `dayWord`, включая
 * исключение для 11–14.
 */
function productWord(count: number): string {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'товаров';
  switch (count % 10) {
    case 1:
      return 'товар';
    case 2:
    case 3:
    case 4:
      return 'товара';
    default:
      return 'товаров';
  }
}

/** "N товаров" в правильной форме — счётчики выдачи каталога и поиска. */
export function productsLabel(count: number): string {
  return `${count} ${productWord(count)}`;
}

/** Honest lead-time label for a to-order product: "Под заказ · N дней". */
export function supplyLeadLabel(days: number): string {
  return `Под заказ · ${daysLabel(days)}`;
}
