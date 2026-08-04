import { Controller, Get, Query } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

@Controller('i18n')
export class I18nDemoController {
  constructor(private readonly i18n: I18nService) {}

  /** Demonstrates RU/КЫ resolution: /i18n/greeting?lang=ky. */
  @Get('greeting')
  greeting(@Query('lang') lang?: string) {
    return {
      lang: lang ?? 'ru',
      message: this.i18n.translate('common.greeting', { lang: lang ?? 'ru' }),
    };
  }
}
