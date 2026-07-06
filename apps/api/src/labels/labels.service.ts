import { Injectable } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import { ValidationError } from '../common/errors';

/**
 * Barcode / QR label generation (bwip-js) for the IMEI-centric warehouse and POS:
 * Code128 IMEI stickers printed on приёмка (later scanned at sale via @zxing) and
 * QR price tags. Output is SVG — resolution-independent for any label printer.
 */
@Injectable()
export class LabelsService {
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
