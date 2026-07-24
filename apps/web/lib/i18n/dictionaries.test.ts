import { describe, expect, it } from 'vitest';
import { translate, isLocale } from './dictionaries';

/**
 * The dictionary is the source of truth for i18n. Its fallback chain (locale → ru
 * → key) and {var} interpolation are the contract every screen relies on.
 */
describe('translate', () => {
  it('returns the Kyrgyz string when present', () => {
    expect(translate('ky', 'login.title.default')).toBe('AliStore-го кирүү');
  });

  it('returns the Russian string for the default locale', () => {
    expect(translate('ru', 'login.title.default')).toBe('Вход в AliStore');
  });

  it('falls back to the key itself when the key is unknown in both locales', () => {
    expect(translate('ky', 'totally.unknown.key')).toBe('totally.unknown.key');
    expect(translate('ru', 'totally.unknown.key')).toBe('totally.unknown.key');
  });

  it('interpolates {vars}', () => {
    expect(translate('ru', 'login.codeSentTo', { identity: '+996700' })).toBe('Код отправлен на +996700');
    expect(translate('ky', 'login.codeSentTo', { identity: '+996700' })).toBe('+996700 дарегине код жөнөтүлдү');
  });

  it('leaves an unmatched placeholder intact', () => {
    expect(translate('ru', 'login.codeSentTo', {})).toBe('Код отправлен на {identity}');
  });

  it('isLocale guards the persisted value', () => {
    expect(isLocale('ky')).toBe(true);
    expect(isLocale('en')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
