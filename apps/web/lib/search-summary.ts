/**
 * Подпись над результатами поиска.
 *
 * Считает сервер, показывает страница срез — и об этом надо говорить вслух.
 * Раньше мобильный поиск писал «Найдено: N» по длине локально отфильтрованного
 * массива и рисовал под ней первые двадцать карточек: подпись и список
 * противоречили друг другу, а покупатель не знал, что остальное существует.
 */
export function searchSummary(input: { total: number | undefined; shown: number }): string {
  const shown = Math.max(0, Math.trunc(input.shown));
  if (shown === 0) return '';

  // `total` меньше показанного — рассинхрон выборки и среза. Верим тому, что
  // человек видит своими глазами, иначе подпись обвиняет саму себя во лжи.
  const raw = typeof input.total === 'number' && Number.isFinite(input.total) ? Math.trunc(input.total) : shown;
  const total = Math.max(raw, shown);

  const found = `Найдено: ${total.toLocaleString('ru-RU')}`;
  return total > shown ? `${found} · показаны первые ${shown}` : found;
}
