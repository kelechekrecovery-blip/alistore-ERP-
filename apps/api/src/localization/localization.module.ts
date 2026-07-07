import { Module } from '@nestjs/common';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import { InMemoryI18nLoader } from './in-memory-i18n.loader';
import { I18nDemoController } from './i18n-demo.controller';

/**
 * Bilingual RU / КЫ (nestjs-i18n). Translations are bundled in TS and served by an
 * in-memory loader. Request language resolves from ?lang, x-lang header, or
 * Accept-Language; falls back to Russian.
 */
@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'ru',
      loaders: [new InMemoryI18nLoader()],
      resolvers: [
        new QueryResolver(['lang']),
        new HeaderResolver(['x-lang']),
        AcceptLanguageResolver,
      ],
    }),
  ],
  controllers: [I18nDemoController],
})
export class LocalizationModule {}
