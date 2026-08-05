import { describe, expect, test } from 'vitest';
import { searchSummary } from './search-summary';

describe('searchSummary', () => {
  test('says how many were found when everything found is on screen', () => {
    expect(searchSummary({ total: 3, shown: 3 })).toBe('Найдено: 3');
  });

  test('admits the list is cut when the server found more than fits', () => {
    // Раньше подпись говорила «Найдено: 137», а под ней лежало двадцать
    // карточек. Покупатель не мог отличить «это всё» от «остальное скрыто».
    expect(searchSummary({ total: 137, shown: 20 })).toBe('Найдено: 137 · показаны первые 20');
  });

  test('never claims fewer found than shown', () => {
    // Рассинхрон total и items возможен: сервер считает total по всей выборке,
    // а страницу отдаёт срезом. Подпись обязана остаться непротиворечивой.
    expect(searchSummary({ total: 2, shown: 5 })).toBe('Найдено: 5');
  });

  test('handles a missing total instead of printing NaN', () => {
    expect(searchSummary({ total: undefined, shown: 4 })).toBe('Найдено: 4');
  });

  test('formats thousands the Russian way', () => {
    // Разделитель — неразрывный пробел (U+00A0), а не обычный: число не должно
    // переноситься по строкам. Пишем его явно, иначе тест «проходит глазами».
    expect(searchSummary({ total: 1240, shown: 20 })).toBe('Найдено: 1\u00A0240 · показаны первые 20');
  });

  test('is empty when nothing is shown — the empty state speaks instead', () => {
    expect(searchSummary({ total: 0, shown: 0 })).toBe('');
  });
});
