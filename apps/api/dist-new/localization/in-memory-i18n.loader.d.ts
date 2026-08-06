import { I18nLoader, I18nTranslation } from 'nestjs-i18n';
export declare class InMemoryI18nLoader extends I18nLoader {
    languages(): Promise<string[]>;
    load(): Promise<I18nTranslation>;
}
