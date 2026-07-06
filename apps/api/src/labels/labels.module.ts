import { Module } from '@nestjs/common';
import { LabelsService } from './labels.service';
import { LabelsController } from './labels.controller';

/**
 * Barcode/QR label generation (bwip-js). Exported so warehouse/приёмка can print
 * an IMEI sticker on unit intake and POS can print QR price tags.
 */
@Module({
  providers: [LabelsService],
  controllers: [LabelsController],
  exports: [LabelsService],
})
export class LabelsModule {}
