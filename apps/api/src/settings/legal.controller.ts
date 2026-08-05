import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

/**
 * Публичные юридические документы витрины.
 *
 * Отдельный контроллер, а не исключение внутри `SettingsController`: тот закрыт
 * гардом на уровне класса, и «публичный метод» в нём был бы дырой, которую
 * легко расширить по неосторожности. Здесь ключ выписан литералом — наружу
 * уходит ровно один документ, а не произвольная настройка по имени.
 *
 * Пустой текст — это «документ не опубликован», и витрина обязана сказать это
 * прямо: показывать шаблон с [Наименование компании] под обязательной галочкой
 * согласия хуже, чем честно признать, что оферты пока нет.
 */
@Controller('legal')
export class LegalController {
  constructor(private readonly settings: SettingsService) {}

  @Get('offer')
  @ApiOperation({ summary: 'Текст публичной оферты (пусто — не опубликована)' })
  @ApiOkResponse({ description: '{ text: string, published: boolean }' })
  async offer(): Promise<{ text: string; published: boolean }> {
    const text = await this.settings.text('legal.offer_text');
    return { text, published: text !== '' };
  }
}
