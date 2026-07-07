import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';

/** Launch-time data migration — import products from Excel/тетрадь (exceljs). */
@Module({
  providers: [ImportService],
  controllers: [ImportController],
  exports: [ImportService],
})
export class ImportModule {}
