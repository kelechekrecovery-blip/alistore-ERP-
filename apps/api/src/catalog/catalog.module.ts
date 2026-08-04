import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  // Настройки нужны каталогу ради условий партнёрских рассрочек: сроки,
  // потолки и наценка магазина — договорные величины, их правит владелец.
  imports: [SettingsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
