import { describe, expect, it } from 'vitest';
import { telegramWidgetInitData } from './telegram-widget';

/**
 * Подпись Telegram считается по строке из тех же пар ключ-значение, что пришли
 * от виджета. Любая вольность сериализации — потерянный ключ, добавленный ключ,
 * другое строковое представление числа — ломает сходимость хеша на сервере, и
 * вход отвечает «telegram_auth_invalid» без внятной причины.
 */
describe('telegramWidgetInitData', () => {
  it('переносит все поля виджета без переименования', () => {
    const params = new URLSearchParams(telegramWidgetInitData({
      id: 12345,
      first_name: 'Аида',
      last_name: 'Осмонова',
      username: 'aida',
      photo_url: 'https://t.me/i/userpic/320/aida.jpg',
      auth_date: 1753900000,
      hash: 'deadbeef',
    }));

    expect(params.get('id')).toBe('12345');
    expect(params.get('first_name')).toBe('Аида');
    expect(params.get('last_name')).toBe('Осмонова');
    expect(params.get('username')).toBe('aida');
    expect(params.get('auth_date')).toBe('1753900000');
    expect(params.get('hash')).toBe('deadbeef');
  });

  /**
   * Отправитель таких пар не подписывал. Строка «null» в data-check-string
   * добавила бы поле, которого не было у Telegram, и хеш перестал бы сходиться.
   */
  it('выбрасывает пустые поля, а не превращает их в строку', () => {
    const value = telegramWidgetInitData({
      id: 1,
      last_name: null,
      username: undefined,
      hash: 'abc',
    });

    expect(value).not.toContain('last_name');
    expect(value).not.toContain('username');
    expect(value).not.toContain('null');
    expect(value).not.toContain('undefined');
  });

  it('сохраняет пустую строку — это значение, а не отсутствие поля', () => {
    const params = new URLSearchParams(telegramWidgetInitData({ id: 1, last_name: '', hash: 'abc' }));
    expect(params.has('last_name')).toBe(true);
    expect(params.get('last_name')).toBe('');
  });

  it('кодирует значения, ломающие query-строку', () => {
    const params = new URLSearchParams(telegramWidgetInitData({
      first_name: 'Иван & Ко',
      username: 'a=b&c',
      hash: 'abc',
    }));

    expect(params.get('first_name')).toBe('Иван & Ко');
    expect(params.get('username')).toBe('a=b&c');
  });

  it('на пустом объекте отдаёт пустую строку, а не мусор', () => {
    expect(telegramWidgetInitData({})).toBe('');
  });
});
