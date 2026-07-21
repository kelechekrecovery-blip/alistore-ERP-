import { describe, expect, it } from 'vitest';
import { parseBasisPoints, parseSom } from './admin-product-form';

/**
 * Пустая цена сохранялась как 0 сом.
 *
 * `Number('')` в JavaScript равен 0, и `Number('   ')` тоже. Обе строки
 * проходили `Number.isInteger(parsed) && parsed >= 0`, поэтому пустое поле
 * цены доезжало до сервера как честный ноль — а сервер его принимал
 * (`ChangePriceDto` требовал лишь `@Min(0)`). Товар выкладывался на витрину
 * бесплатным.
 *
 * Кнопка отправки при этом блокировалась только на `busy`, то есть пустое поле
 * ничего не останавливало.
 */
describe('parseSom · пустое значение это не ноль', () => {
  it('пустая строка — отказ, а не 0 сом', () => {
    expect(() => parseSom('', 'Новая цена')).toThrow(/Новая цена/);
  });

  it('пробелы — тоже отказ: Number("   ") тоже равен нулю', () => {
    expect(() => parseSom('   ', 'Новая цена')).toThrow(/Новая цена/);
  });

  it('явный ноль по-прежнему допустим — это осознанный ввод', () => {
    expect(parseSom('0', 'Себестоимость')).toBe(0);
  });

  it('обычные значения не затронуты', () => {
    expect(parseSom('119900', 'Новая цена')).toBe(119_900);
    expect(() => parseSom('12.5', 'Новая цена')).toThrow();
    expect(() => parseSom('-1', 'Новая цена')).toThrow();
    expect(() => parseSom('дорого', 'Новая цена')).toThrow();
  });
});

describe('parseBasisPoints · та же дыра в ставке налога', () => {
  it('пустая строка не превращается в ставку 0', () => {
    expect(() => parseBasisPoints('')).toThrow(/Ставка налога/);
    expect(() => parseBasisPoints('  ')).toThrow(/Ставка налога/);
  });

  it('границы сохранены', () => {
    expect(parseBasisPoints('0')).toBe(0);
    expect(parseBasisPoints('10000')).toBe(10_000);
    expect(() => parseBasisPoints('10001')).toThrow();
  });
});
