import { ValidationError } from '../common/errors';
import {
  isTextSetting,
  parseSettingText,
  parseSettingValue,
  settingDefinition,
} from './settings.registry';

const QR_KEY = 'installment.payda.qr_url';

describe('текстовые параметры (QR провайдеров рассрочки)', () => {
  it('QR каждого провайдера объявлен и по умолчанию пуст', () => {
    for (const key of [
      'installment.payda.qr_url',
      'installment.omarket.qr_url',
      'installment.zero.qr_url',
      'installment.mplus.qr_url',
    ]) {
      const definition = settingDefinition(key);
      expect(isTextSetting(definition)).toBe(true);
      // Пусто — значит «владелец ещё не поставил». Придумывать ссылку нельзя:
      // блок «где оформить» просто не показывается.
      expect(definition.fallback).toBe('');
    }
  });

  it('принимает путь к загруженному файлу', () => {
    const definition = settingDefinition(QR_KEY);
    expect(parseSettingText(definition, '/media/qr-payda.png')).toBe('/media/qr-payda.png');
  });

  it('принимает https-ссылку и обрезает пробелы по краям', () => {
    const definition = settingDefinition(QR_KEY);
    expect(parseSettingText(definition, '  https://cdn.example.com/qr.png  ')).toBe(
      'https://cdn.example.com/qr.png',
    );
  });

  it('пустая строка допустима — так QR снимают', () => {
    const definition = settingDefinition(QR_KEY);
    expect(parseSettingText(definition, '   ')).toBe('');
  });

  it('отвергает javascript: — это XSS в атрибуте картинки, а не адрес', () => {
    const definition = settingDefinition(QR_KEY);
    expect(() => parseSettingText(definition, 'javascript:alert(1)')).toThrow(ValidationError);
  });

  it('отвергает data: — QR обязан быть файлом, а не полем на мегабайт', () => {
    const definition = settingDefinition(QR_KEY);
    expect(() => parseSettingText(definition, 'data:image/png;base64,AAAA')).toThrow(ValidationError);
  });

  it('отвергает http:// — смешанный контент на https-витрине не загрузится', () => {
    const definition = settingDefinition(QR_KEY);
    expect(() => parseSettingText(definition, 'http://cdn.example.com/qr.png')).toThrow(ValidationError);
  });

  it('отвергает слишком длинное значение', () => {
    const definition = settingDefinition(QR_KEY);
    expect(() => parseSettingText(definition, `/media/${'a'.repeat(2000)}.png`)).toThrow(ValidationError);
  });

  it('числовой разбор к текстовому параметру не применяется', () => {
    // Иначе «/media/qr.png» стало бы NaN и молча превратилось в ошибку
    // диапазона вместо внятного «это текстовый параметр».
    const definition = settingDefinition(QR_KEY);
    expect(() => parseSettingValue(definition, '/media/qr.png')).toThrow(ValidationError);
  });

  it('текстовый разбор к числовому параметру не применяется', () => {
    const numeric = settingDefinition('installment.payda.months');
    expect(isTextSetting(numeric)).toBe(false);
    expect(() => parseSettingText(numeric, '3')).toThrow(ValidationError);
  });
});
