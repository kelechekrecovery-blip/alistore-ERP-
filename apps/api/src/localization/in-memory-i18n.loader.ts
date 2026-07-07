import { I18nLoader, I18nTranslation } from 'nestjs-i18n';
import { TRANSLATIONS } from './translations';

/** Serves the bundled TS translations to nestjs-i18n (no JSON files on disk). */
export class InMemoryI18nLoader extends I18nLoader {
  async languages(): Promise<string[]> {
    return Object.keys(TRANSLATIONS);
  }

  async load(): Promise<I18nTranslation> {
    return TRANSLATIONS;
  }
}
