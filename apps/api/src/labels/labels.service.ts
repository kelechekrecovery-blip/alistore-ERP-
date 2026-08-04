import { Injectable } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';

/**
 * Barcode / QR label generation (bwip-js) for the IMEI-centric warehouse and POS:
 * Code128 IMEI stickers printed on приёмка (later scanned at sale via @zxing) and
 * QR price tags. Output is SVG — resolution-independent for any label printer.
 */
@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * IMEI label for a unit already in the warehouse — verifies the IMEI exists and
   * returns its Code128 sticker plus product name/status for the print dialog.
   * Reads DeviceUnit/Product from the DB; no coupling to warehouse/intake code.
   */
  async unitLabel(
    imei: string,
  ): Promise<{ imei: string; product: string; status: string; svg: string }> {
    const value = imei.trim();
    const unit = await this.prisma.deviceUnit.findUnique({
      where: { imei: value },
    });
    if (!unit) {
      throw new ValidationError('unit_not_found', `IMEI ${value} не найден`);
    }
    const product = await this.prisma.product.findUnique({
      where: { id: unit.productId },
    });
    return {
      imei: value,
      product: product?.name ?? unit.productId,
      status: unit.status,
      svg: this.imeiBarcode(value),
    };
  }

  /** Code128 barcode for an IMEI/serial, with the number printed beneath it. */
  imeiBarcode(imei: string): string {
    const text = imei.trim();
    if (!text) {
      throw new ValidationError('empty_imei', 'IMEI пуст');
    }
    return bwipjs.toSVG({
      bcid: 'code128',
      text,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
    });
  }

  /** QR label encoding an arbitrary string (e.g. a product page URL). */
  qrLabel(text: string): string {
    const value = text.trim();
    if (!value) {
      throw new ValidationError('empty_qr', 'Пустой QR');
    }
    return bwipjs.toSVG({ bcid: 'qrcode', text: value, scale: 4 });
  }
}
